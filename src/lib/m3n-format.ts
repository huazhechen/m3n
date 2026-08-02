import { splitSupplementBlocks } from './notation/supplements'
import { durationInBeats, parseM3NNote } from './notation/m3n-primitives'
import { tokenizeM3N } from './notation/m3n-tokens'
import { parseM3NDocument, type DirectEvent } from './m3n-direct'

const BARLINE = /(:\|\|\||:\|\|:|:\|\||\|\|:|\|\|\||\|\||\|)/g
const EPSILON = 1e-9

/** Places a jump on the measure it concludes, then combines its terminal bar. */
export function normalizeAdjacentBarlines(source: string) {
  return source
    .replace(/(:\|\|\||:\|\|:|:\|\||\|\|:|\|\|\||\|\||\|)\s*(\{(?:ds|dc|fine)\})/g, '$2$1')
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
    if (/\s/.test(source[index])) {
      index += 1
      continue
    }
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
  if (!parsed) return null
  return [{
    raw: node.raw,
    duration: durationInBeats(depth, parsed.carets.length, parsed.dots.length),
    carets: parsed.carets.length,
    dots: parsed.dots.length,
  }]
}

function renderBeamLevel(leaves: BeamLeaf[], depth: number): string {
  const result: string[] = []
  for (let index = 0; index < leaves.length;) {
    const leaf = leaves[index]
    if (Math.abs(durationInBeats(depth, leaf.carets, leaf.dots) - leaf.duration) < EPSILON) {
      result.push(leaf.raw)
      index += 1
      continue
    }
    const nested: BeamLeaf[] = []
    while (index < leaves.length && Math.abs(durationInBeats(depth, leaves[index].carets, leaves[index].dots) - leaves[index].duration) >= EPSILON) {
      nested.push(leaves[index])
      index += 1
    }
    result.push(`(${renderBeamLevel(nested, depth + 1)})`)
  }
  return result.join(' ')
}

function normalizeBeamRun(nodes: BeamGroup[]) {
  const leaves = nodes.flatMap((node) => beamLeaves(node) ?? [])
  if (leaves.length === 0) return null
  const output: string[] = []
  let unit: BeamLeaf[] = []
  let beats = 0
  for (const leaf of leaves) {
    if (beats + leaf.duration > 1 + EPSILON) return null
    unit.push(leaf)
    beats += leaf.duration
    if (Math.abs(beats - 1) < EPSILON) {
      output.push(unit.length === 1 ? unit[0].raw : `(${renderBeamLevel(unit, 1)})`)
      unit = []
      beats = 0
    }
  }
  return unit.length === 0 ? output.join(' ') : null
}

function normalizeBeamGroups(source: string) {
  let output = ''
  for (let index = 0; index < source.length;) {
    if (source.startsWith('//', index)) {
      const newline = source.indexOf('\n', index)
      const end = newline < 0 ? source.length : newline + 1
      output += source.slice(index, end)
      index = end
      continue
    }
    const interval = /^\{(?:lg|cresc|decres|8va|8vb|inst|accel=\d+|rit=\d+)\}/.exec(source.slice(index))?.[0]
    if (interval) {
      const close = source.indexOf('{/}', index + interval.length)
      if (close >= 0) {
        output += source.slice(index, close + 3)
        index = close + 3
        continue
      }
    }
    if (source[index] !== '(') {
      output += source[index]
      index += 1
      continue
    }
    const first = parseBeamGroup(source, index)
    if (!first) {
      output += source[index]
      index += 1
      continue
    }
    const nodes = [first.node]
    let end = first.end
    while (true) {
      const whitespace = /^\s+/.exec(source.slice(end))?.[0] ?? ''
      const next = whitespace && source[end + whitespace.length] === '(' ? parseBeamGroup(source, end + whitespace.length) : null
      if (!next) break
      nodes.push(next.node)
      end = next.end
    }
    const normalized = nodes.length > 1 ? normalizeBeamRun(nodes) : null
    output += normalized ?? source.slice(index, end)
    index = end
  }
  return output
}

function restForBeats(beats: number) {
  for (let depth = 0; depth <= 6; depth += 1) {
    for (let carets = 0; carets <= 6; carets += 1) {
      for (let dots = 0; dots <= 4; dots += 1) {
        if (Math.abs(durationInBeats(depth, carets, dots) - beats) >= EPSILON) continue
        return `${'('.repeat(depth)}0${'^'.repeat(carets)}${'.'.repeat(dots)}${')'.repeat(depth)}`
      }
    }
  }
  return null
}

function respectsMergeBoundary(offset: number, beats: number, event: DirectEvent) {
  const meterCount = event.meterCount ?? 4
  const beat = 4 / (event.meterUnit ?? 4)
  const measureBeats = meterCount * beat
  const end = offset + beats
  if (end > measureBeats + EPSILON) return false
  if (meterCount % 2 === 0) {
    const midpoint = measureBeats / 2
    return !(offset > EPSILON && offset < midpoint - EPSILON && end > midpoint + EPSILON)
  }
  const beginsOnBeat = Math.abs(offset / beat - Math.round(offset / beat)) < EPSILON
  const crossesBeat = Math.floor((offset + EPSILON) / beat) !== Math.floor((end - EPSILON) / beat)
  return beginsOnBeat || !crossesBeat
}

function restRunReplacement(events: DirectEvent[], source: string, offset: number, depth: number) {
  if (events.length < 2 || events.some((event) => event.kind !== 'rest')) return null
  const beats = events.reduce((sum, event) => sum + event.beats, 0)
  if (!respectsMergeBoundary(offset, beats, events[0]!)) return null
  let start = events[0]?.sourceStart
  let end = events.at(-1)?.sourceEnd
  const value = restForBeats(beats)
  if (start === undefined || end === undefined || !value) return null
  if (depth === 1) {
    while (start > 0 && /\s/.test(source[start - 1] ?? '')) start -= 1
    while (end < source.length && /\s/.test(source[end] ?? '')) end += 1
    if (source[start - 1] !== '(' || source[end] !== ')') return null
    start -= 1
    end += 1
  } else if (depth !== 0) return null
  const allowedNotation = depth === 1 ? /^[\s()0^.]+$/ : /^[\s0^.]+$/
  return allowedNotation.test(source.slice(start, end)) ? { start, end, value } : null
}

function tiedNoteReplacement(events: DirectEvent[], source: string, offset: number, depth: number) {
  const first = events[0]
  if (!first || events.length < 2 || depth !== 0 || events.some((event) => event.kind !== 'note' || event.pitches.length !== 1 || event.pitches[0] !== first.pitches[0])) return null
  const beats = events.reduce((sum, event) => sum + event.beats, 0)
  if (!respectsMergeBoundary(offset, beats, first)) return null
  const start = first.sourceStart
  const end = events.at(-1)?.sourceEnd
  const pitch = first.pitches[0]
  if (end === undefined || !pitch) return null
  for (let carets = 0; carets <= 6; carets += 1) {
    for (let dots = 0; dots <= 4; dots += 1) {
      if (Math.abs(durationInBeats(0, carets, dots) - beats) >= EPSILON) continue
      const value = `${pitch}${'^'.repeat(carets)}${'.'.repeat(dots)}`
      return /^[\s1-7#b=ed^.~]+$/.test(source.slice(start, end)) ? { start, end, value } : null
    }
  }
  return null
}

function mergeSustainedAtoms(source: string) {
  const replacements: Array<{ start: number; end: number; value: string }> = []
  const document = parseM3NDocument(source)
  const hasForcedTiedLyrics = document.lyrics.some((block) => block.syllables.some((syllable) => syllable.forceTiedTarget))
  const parenTokens = tokenizeM3N(source).filter((token) => token.kind === 'open-paren' || token.kind === 'close-paren')
  const parenDepthAt = (position: number) => parenTokens.reduce((depth, token) => (
    token.start < position ? depth + (token.kind === 'open-paren' ? 1 : -1) : depth
  ), 0)
  for (const part of document.parts.values()) {
    for (const staff of [part.melody, part.bass]) {
      for (const measure of staff) {
        let restRun: DirectEvent[] = []
        let offset = 0
        let restRunOffset = 0
        const flushRestRun = () => {
          const first = restRun[0]
          const replacement = first ? restRunReplacement(restRun, source, restRunOffset, parenDepthAt(first.sourceStart)) : null
          if (replacement) replacements.push(replacement)
          restRun = []
        }
        for (const event of [...measure.events, null]) {
          if (event?.kind === 'rest') {
            const runBeats = restRun.reduce((sum, item) => sum + item.beats, 0)
            if (restRun.length > 0 && !respectsMergeBoundary(restRunOffset, runBeats + event.beats, event)) flushRestRun()
            if (restRun.length === 0) restRunOffset = offset
            restRun.push(event)
          } else if (restRun.length > 0) flushRestRun()
          if (event) offset += event.beats
        }

        if (hasForcedTiedLyrics) continue
        const offsets = measure.events.reduce<number[]>((values, event) => [...values, (values.at(-1) ?? 0) + event.beats], [0])
        for (let index = 0; index < measure.events.length - 1;) {
          const first = measure.events[index]
          if (!first || first.kind !== 'note' || !first.tie) {
            index += 1
            continue
          }
          const run = [first]
          let endIndex = index
          while (run.at(-1)?.tie && endIndex + 1 < measure.events.length) {
            const next = measure.events[endIndex + 1]
            if (!next || next.kind !== 'note' || next.pitches[0] !== first.pitches[0]) break
            run.push(next)
            endIndex += 1
          }
          if (!run.at(-1)?.tie) {
            const replacement = tiedNoteReplacement(run, source, offsets[index] ?? 0, parenDepthAt(first.sourceStart))
            if (replacement) replacements.push(replacement)
          }
          index = Math.max(index + 1, endIndex + 1)
        }
      }
    }
  }
  return replacements.sort((left, right) => right.start - left.start).reduce(
    (result, replacement) => `${result.slice(0, replacement.start)}${replacement.value}${result.slice(replacement.end)}`,
    source,
  )
}

function noteForBeats(pitch: string, beats: number, tied: boolean) {
  for (let carets = 0; carets <= 6; carets += 1) {
    for (let dots = 0; dots <= 4; dots += 1) {
      if (Math.abs(durationInBeats(0, carets, dots) - beats) < EPSILON) {
        return `${pitch}${'^'.repeat(carets)}${'.'.repeat(dots)}${tied ? '~' : ''}`
      }
    }
  }
  return null
}

function splitSustainedNotesAtBeatBoundaries(source: string) {
  const replacements: Array<{ start: number; end: number; value: string }> = []
  const document = parseM3NDocument(source)
  for (const part of document.parts.values()) {
    for (const staff of [part.melody, part.bass]) {
      for (const measure of staff) {
        let offset = 0
        for (const event of measure.events) {
          const meterCount = event.meterCount ?? document.meterCount
          const meterUnit = event.meterUnit ?? document.meterUnit
          const beat = 4 / meterUnit
          const measureBeats = meterCount * beat
          const midpoint = meterCount % 2 === 0 ? measureBeats / 2 : undefined
          const boundary = midpoint && offset > EPSILON && offset < midpoint - EPSILON && offset + event.beats > midpoint + EPSILON
            ? midpoint
            : undefined
          if (boundary && event.kind === 'note' && event.pitches.length === 1) {
            const firstBeats = boundary - offset
            const secondBeats = event.beats - firstBeats
            const pitch = event.pitches[0]
            const first = pitch && noteForBeats(pitch, firstBeats, true)
            const second = pitch && noteForBeats(pitch, secondBeats, event.tie)
            if (first && second) replacements.push({ start: event.sourceStart, end: event.sourceEnd, value: `${first} ${second}` })
          }
          offset += event.beats
        }
      }
    }
  }
  return replacements.sort((left, right) => right.start - left.start).reduce(
    (result, replacement) => `${result.slice(0, replacement.start)}${replacement.value}${result.slice(replacement.end)}`,
    source,
  )
}

function formatMusic(source: string) {
  const commentBreak = '\u0000'
  const compact = normalizeAdjacentBarlines(normalizeBeamGroups(source))
    .trim()
    .replace(/\/\/[^\r\n]*/g, (comment) => `${comment}${commentBreak}`)
    .replace(/\s+/g, ' ')
    .replaceAll(`${commentBreak} `, commentBreak)
    .replaceAll(commentBreak, '\n')
  const pieces = compact.split(BARLINE)
  const lines: string[] = []
  let line = ''
  let measures = 0

  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index]?.trim()
    if (!piece) continue
    line = `${line}${line ? ' ' : ''}${piece}`
    if (index % 2 === 1) {
      measures += 1
      if (measures === 4) {
        lines.push(line)
        line = ''
        measures = 0
      }
    }
  }
  if (line) lines.push(line)
  return lines.join('\n').replace(/\{(ds|dc|fine)\}\s+(:\|\|\||:\|\|:|:\|\||\|\|:|\|\|\||\|\||\|)/g, '{$1}$2')
}

function formatMain(source: string) {
  const header = /^.*\{key=[^\n]+$/m.exec(source)
  if (!header || header.index === undefined) return formatMusic(source)
  const headerEnd = header.index + header[0].length
  const music = source.slice(headerEnd).trim()
  return `${source.slice(0, headerEnd).trimEnd()}\n${formatMusic(music)}`
}

function formatLyrics(source: string) {
  return source.split(/\r?\n/).map((line) => {
    if (line.trimStart().startsWith('//')) return line.trimEnd()
    const text = line.replace(/\s+/g, (whitespace, offset) => {
      const previous = line.slice(0, offset).at(-1) ?? ''
      const next = line[offset + whitespace.length] ?? ''
      return /[A-Za-z0-9]/.test(previous) || /[A-Za-z0-9]/.test(next) ? ' ' : ''
    }).trim()
    return text.replace(/%(?:\s*%)+/g, (run) => `{%${(run.match(/%/g) ?? []).length}}`)
  }).join('\n')
}

/** Formats M3N source without changing its musical or lyric content. */
export function formatM3N(source: string) {
  const { main, bass, lyrics } = splitSupplementBlocks(splitSustainedNotesAtBeatBoundaries(mergeSustainedAtoms(source)))
  const supplements = [
    ...lyrics.map((lyric) => {
      const text = formatLyrics(lyric.text)
      return `{lyrics${lyric.range ? `=${lyric.range}` : ''}}\n${text}\n{/}`
    }),
    bass ? `{bass}\n${formatMusic(bass)}\n{/}` : '',
  ].filter(Boolean)
  return `${formatMain(main)}${supplements.length > 0 ? `\n\n${supplements.join('\n\n')}` : ''}\n`
}
