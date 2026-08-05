import { durationInBeats, parseM3NNote } from './notation/m3n-primitives'
import { parseM3NSyntaxTree } from './notation/syntax-tree'
import { parseM3NDocument } from './m3n-direct'
import { parseLyricItems } from './notation/lyrics'
import { parseM3NDocumentStructure } from './notation/m3n-document'
import { phraseLyricTargets } from './m3n-validate'
import type { ScoreDocument, ScoreEvent } from './notation/score-document'
import type { M3NSyntaxTree } from './notation/syntax-tree'

const EPSILON = 1e-9

/** Places a navigation marker on the barline it concludes. */
export function normalizeAdjacentBarlines(source: string) {
  return source
    .replace(/(?:\|\||\|)\s+(?=:\|\|)/g, '')
    .replace(/:\|\|\s*\|\|\|/g, ':|||')
}

type BeamAtom = { raw: string }
type BeamGroup = { children: BeamNode[] }
type BeamNode = BeamAtom | BeamGroup
type BeamLeaf = { raw: string; duration: number; carets: number; dots: number }

function parseBeamGroup(source: string, start: number): { node: BeamGroup; end: number } | null {
  let index = start + 1
  const children: BeamNode[] = []
  while (index < source.length) {
    if (/\s/.test(source[index] ?? '')) { index += 1; continue }
    if (source[index] === ')') return children.length > 0 ? { node: { children }, end: index + 1 } : null
    if (source[index] === '(') {
      const nested = parseBeamGroup(source, index)
      if (!nested) return null
      children.push(nested.node)
      index = nested.end
      continue
    }
    const raw = /^(?:0|[1-7])[#b=ed^.~]*/.exec(source.slice(index))?.[0]
    if (!raw || !parseM3NNote(raw)) return null
    children.push({ raw })
    index += raw.length
  }
  return null
}

function beamLeaves(node: BeamNode, depth = 0): BeamLeaf[] | null {
  if ('children' in node) {
    const children = node.children.map((child) => beamLeaves(child, depth + 1))
    return children.some((child) => !child) ? null : children.flat() as BeamLeaf[]
  }
  const parsed = parseM3NNote(node.raw)
  return parsed ? [{ raw: node.raw, duration: durationInBeats(depth, parsed.carets.length, parsed.dots.length), carets: parsed.carets.length, dots: parsed.dots.length }] : null
}

function renderBeamLevel(leaves: BeamLeaf[], depth: number): string {
  const result: string[] = []
  for (let index = 0; index < leaves.length;) {
    const leaf = leaves[index]
    if (!leaf) break
    if (Math.abs(durationInBeats(depth, leaf.carets, leaf.dots) - leaf.duration) < EPSILON) { result.push(leaf.raw); index += 1; continue }
    const nested: BeamLeaf[] = []
    while (index < leaves.length) {
      const candidate = leaves[index]
      if (!candidate || Math.abs(durationInBeats(depth, candidate.carets, candidate.dots) - candidate.duration) < EPSILON) break
      nested.push(candidate)
      index += 1
    }
    result.push(`(${renderBeamLevel(nested, depth + 1)})`)
  }
  return result.join(' ')
}

function normalizeBeamGroups(source: string) {
  let output = ''
  for (let index = 0; index < source.length;) {
    if (source.startsWith('//', index)) { output += source.slice(index); break }
    const interval = /^\{(?:lg|cresc|decres|8va|8vb|inst|accel=\d+|rit=\d+)\}/.exec(source.slice(index))?.[0]
    if (interval) {
      const close = source.indexOf('{/}', index + interval.length)
      if (close >= 0) { output += source.slice(index, close + 3); index = close + 3; continue }
    }
    if (source[index] === '{') {
      const end = source.indexOf('}', index)
      if (end >= 0) { output += source.slice(index, end + 1); index = end + 1; continue }
    }
    if (source[index] !== '(') { output += source[index] ?? ''; index += 1; continue }
    const first = parseBeamGroup(source, index)
    if (!first) { output += source[index] ?? ''; index += 1; continue }
    const nodes = [first.node]
    let end = first.end
    while (true) {
      const whitespace = /^\s+/.exec(source.slice(end))?.[0] ?? ''
      const next = whitespace && source[end + whitespace.length] === '(' ? parseBeamGroup(source, end + whitespace.length) : null
      if (!next) break
      nodes.push(next.node)
      end = next.end
    }
    const leaves = nodes.flatMap((node) => beamLeaves(node) ?? [])
    const units: BeamLeaf[][] = []
    let unit: BeamLeaf[] = []
    let beats = 0
    let valid = true
    for (const leaf of leaves) {
      if (beats + leaf.duration > 1 + EPSILON) { valid = false; break }
      unit.push(leaf)
      beats += leaf.duration
      if (Math.abs(beats - 1) < EPSILON) { units.push(unit); unit = []; beats = 0 }
    }
    const normalized = nodes.length > 1 && valid && unit.length === 0 && units.length > 0
      ? units.map((items) => items.length === 1 ? items[0]?.raw ?? '' : `(${renderBeamLevel(items, 1)})`).join(' ')
      : null
    output += normalized ?? source.slice(index, end)
    index = end
  }
  return output
}

function respectsMergeBoundary(offset: number, beats: number, event: ScoreEvent) {
  const beat = 4 / (event.meterUnit ?? 4)
  const measureBeats = (event.meterCount ?? 4) * beat
  const end = offset + beats
  if (end > measureBeats + EPSILON) return false
  if ((event.meterCount ?? 4) % 2 === 0) return !(offset > EPSILON && offset < measureBeats / 2 - EPSILON && end > measureBeats / 2 + EPSILON)
  const beginsOnBeat = Math.abs(offset / beat - Math.round(offset / beat)) < EPSILON
  return beginsOnBeat || Math.floor((offset + EPSILON) / beat) === Math.floor((end - EPSILON) / beat)
}

function durationToken(pitch: string, beats: number, tied = false) {
  for (let carets = 0; carets <= 6; carets += 1) {
    for (let dots = 0; dots <= 4; dots += 1) {
      if (Math.abs(durationInBeats(0, carets, dots) - beats) < EPSILON) return `${pitch}${'^'.repeat(carets)}${'.'.repeat(dots)}${tied ? '~' : ''}`
    }
  }
  return null
}

function restRunReplacement(events: ScoreEvent[], source: string, offset: number, depth: number) {
  const first = events[0]
  const last = events.at(-1)
  if (!first || !last || events.length < 2 || events.some((event) => event.kind !== 'rest')) return null
  const beats = events.reduce((sum, event) => sum + event.beats, 0)
  const value = respectsMergeBoundary(offset, beats, first) ? durationToken('0', beats) : null
  if (!value) return null
  let start = first.sourceStart
  let end = last.sourceEnd
  if (depth === 1) {
    while (start > 0 && /\s/.test(source[start - 1] ?? '')) start -= 1
    while (end < source.length && /\s/.test(source[end] ?? '')) end += 1
    if (source[start - 1] !== '(' || source[end] !== ')') return null
    start -= 1
    end += 1
  } else if (depth !== 0) return null
  const allowed = depth === 1 ? /^[\s()0^.]+$/ : /^[\s0^.]+$/
  return allowed.test(source.slice(start, end)) ? { start, end, value } : null
}

function replaceSustainedAtoms(source: string, splitAtStrongBeat: boolean, context?: { score: ScoreDocument; syntaxTree: M3NSyntaxTree }) {
  const replacements: Array<{ start: number; end: number; value: string }> = []
  const document = context?.score ?? parseM3NDocument(source)
  const hasForcedTiedLyrics = document.lyrics.some((block) => block.syllables.some((syllable) => syllable.forceTiedTarget))
  const parenTokens = (context?.syntaxTree ?? parseM3NSyntaxTree(source)).tokens.filter((token) => token.kind === 'open-paren' || token.kind === 'close-paren')
  const parenDepthAt = (position: number) => parenTokens.reduce((depth, token) => token.start < position ? depth + (token.kind === 'open-paren' ? 1 : -1) : depth, 0)

  for (const part of document.parts.values()) for (const staff of [part.melody, part.bass]) for (const measure of staff) {
    const offsets = measure.events.reduce<number[]>((values, event) => [...values, (values.at(-1) ?? 0) + event.beats], [0])
    for (const [index, event] of measure.events.entries()) {
      const offset = offsets[index] ?? 0
      const meterCount = event.meterCount ?? document.meterCount
      const meterUnit = event.meterUnit ?? document.meterUnit
      const midpoint = meterCount % 2 === 0 ? meterCount * 2 / meterUnit : undefined
      if (splitAtStrongBeat && midpoint && offset > EPSILON && offset < midpoint - EPSILON && offset + event.beats > midpoint + EPSILON && event.kind === 'note' && event.pitches.length === 1) {
        const pitch = event.pitches[0]
        const first = pitch && durationToken(pitch, midpoint - offset, true)
        const second = pitch && durationToken(pitch, event.beats - midpoint + offset, event.tie)
        if (first && second) replacements.push({ start: event.sourceStart, end: event.sourceEnd, value: `${first} ${second}` })
      }
    }
    if (splitAtStrongBeat) continue
    let restRun: ScoreEvent[] = []
    let restOffset = 0
    const flushRestRun = () => {
      const first = restRun[0]
      const replacement = first ? restRunReplacement(restRun, source, restOffset, parenDepthAt(first.sourceStart)) : null
      if (replacement) replacements.push(replacement)
      restRun = []
    }
    for (const [index, event] of [...measure.events, null].entries()) {
      if (event?.kind === 'rest') {
        const currentBeats = restRun.reduce((sum, item) => sum + item.beats, 0)
        if (restRun.length > 0 && !respectsMergeBoundary(restOffset, currentBeats + event.beats, event)) flushRestRun()
        if (restRun.length === 0) restOffset = offsets[index] ?? 0
        restRun.push(event)
      } else if (restRun.length > 0) flushRestRun()
    }
    if (hasForcedTiedLyrics) continue
    for (let index = 0; index < measure.events.length - 1;) {
      const first = measure.events[index]
      if (!first || first.kind !== 'note' || !first.tie || first.pitches.length !== 1 || parenDepthAt(first.sourceStart) !== 0) { index += 1; continue }
      const run = [first]
      let endIndex = index
      while (run.at(-1)?.tie && endIndex + 1 < measure.events.length) {
        const next = measure.events[endIndex + 1]
        if (!next || next.kind !== 'note' || next.pitches.length !== 1 || next.pitches[0] !== first.pitches[0]) break
        run.push(next); endIndex += 1
      }
      if (!run.at(-1)?.tie) {
        const beats = run.reduce((sum, event) => sum + event.beats, 0)
        const value = first.pitches[0] && respectsMergeBoundary(offsets[index] ?? 0, beats, first) ? durationToken(first.pitches[0], beats) : null
        const end = run.at(-1)?.sourceEnd
        if (value && end !== undefined && /^[\s1-7#b=ed^.~]+$/.test(source.slice(first.sourceStart, end))) replacements.push({ start: first.sourceStart, end, value })
      }
      index = Math.max(index + 1, endIndex + 1)
    }
  }
  return replacements.sort((left, right) => right.start - left.start).reduce((result, replacement) => `${result.slice(0, replacement.start)}${replacement.value}${result.slice(replacement.end)}`, source)
}

function splitInlineComment(line: string) {
  let braceDepth = 0
  for (let index = 0; index < line.length - 1; index += 1) {
    const character = line[index]
    if (character === '{') braceDepth += 1
    else if (character === '}' && braceDepth > 0) braceDepth -= 1
    else if (braceDepth === 0 && character === '/' && line[index + 1] === '/') {
      return { content: line.slice(0, index), comment: line.slice(index).trimEnd() }
    }
  }
  return { content: line, comment: '' }
}

function normalizeWhitespaceOutsideDirectives(value: string) {
  let result = ''
  let directive = ''
  let inDirective = false
  let whitespace = false

  for (const character of value.trim()) {
    if (inDirective) {
      directive += character
      if (character === '}') {
        result += directive.replace(/[ \t]{2,}/g, ' ')
        directive = ''
        inDirective = false
      }
      continue
    }
    if (character === '{') {
      if (whitespace && result) result += ' '
      whitespace = false
      directive = character
      inDirective = true
      continue
    }
    if (/\s/.test(character)) {
      whitespace = true
      continue
    }
    if (whitespace && result) result += ' '
    whitespace = false
    result += character
  }

  return result + directive
}

function normalizeLyricWhitespace(value: string) {
  const text = value.trim()
  return text.replace(/[ \t]+/g, (whitespace, offset) => {
    const previous = text.slice(0, offset).at(-1) ?? ''
    const next = text[offset + whitespace.length] ?? ''
    return /[A-Za-z0-9]/.test(previous) || /[A-Za-z0-9]/.test(next) ? ' ' : ''
  }).replace(/%(?:\s*%)+/g, (run) => `{%${(run.match(/%/g) ?? []).length}}`)
}

function appendComment(content: string, comment: string) {
  return comment ? `${content}${content ? '  ' : ''}${comment}` : content
}

function formatContent(value: string, lyric = false) {
  const { content, comment } = splitInlineComment(value)
  const formatted = lyric ? normalizeLyricWhitespace(content) : normalizeWhitespaceOutsideDirectives(content)
  return appendComment(formatted, comment)
}

function formatLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('//')) return trimmed

  const phraseLine = /^(N|B|C|L\d*):\s*(.*)$/.exec(trimmed)
  if (phraseLine) {
    const kind = phraseLine[1] ?? ''
    const source = phraseLine[2] ?? ''
    const music = kind === 'N' || kind === 'B'
      ? normalizeAdjacentBarlines(normalizeBeamGroups(source.replace(/\{br\}/g, ' ')))
      : source
    return `${kind}: ${formatContent(music, kind.startsWith('L'))}`.trimEnd()
  }

  const phraseSeparator = /^---\s*(V\d+(?:\s*,\s*V\d+)*)?\s*$/.exec(trimmed)
  if (phraseSeparator) return `---${(phraseSeparator[1] ?? '').replace(/\s+/g, '')}`

  const partSeparator = /^===\s*(.*)$/.exec(trimmed)
  if (partSeparator) return `===${partSeparator[1]?.trim() ?? ''}`

  return formatContent(trimmed)
}

function addLyricMeasureBars(source: string) {
  const structure = parseM3NDocumentStructure(source)
  const document = parseM3NDocument(source)
  const insertions: Array<{ start: number; end: number }> = []
  for (const section of structure.sections) for (const phrase of section.phrases) {
    const targetsByPass = phraseLyricTargets(document, structure, section.name, phrase)
    for (const lyric of phrase.lyrics) {
      if (lyric.text.includes('|')) continue
      const pass = Number(lyric.label || 1)
      const measures = targetsByPass.get(pass) ?? targetsByPass.values().next().value
      if (!measures || measures.length < 2) continue
      const items = parseLyricItems(lyric.text, lyric.start, 'char')
      let itemIndex = 0
      for (const targets of measures.slice(0, -1)) {
        let remaining = targets.filter((target) => !target.tied).length
        while (itemIndex < items.length && remaining > 0) {
          const item = items[itemIndex]
          itemIndex += 1
          if (!item) break
          remaining -= 1
        }
        const item = items[itemIndex - 1]
        if (!item || remaining > 0) break
        let end = item.sourceEnd
        while (end < source.length && /[ \t]/.test(source[end] ?? '')) end += 1
        insertions.push({ start: item.sourceEnd, end })
      }
    }
  }
  return [...new Map(insertions.map((item) => [item.start, item])).values()].sort((left, right) => right.start - left.start)
    .reduce((result, item) => `${result.slice(0, item.start)} | ${result.slice(item.end)}`, source)
}

/** Formats M3N layout without changing musical, structural, or lyric semantics. */
export function formatM3N(source: string, context?: { score: ScoreDocument; syntaxTree: M3NSyntaxTree }) {
  const normalizedSource = source.replace(/\r\n?/g, '\n')
  const reusableContext = normalizedSource === source ? context : undefined
  const merged = replaceSustainedAtoms(normalizedSource, false, reusableContext)
  const normalized = replaceSustainedAtoms(merged, true)
  const formatted = `${normalized.split('\n').map(formatLine).filter(Boolean).join('\n')}\n`
  return addLyricMeasureBars(formatted)
}
