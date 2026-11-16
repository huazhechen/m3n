import { durationInBeats, parseM3NNote } from '../notation/m3n-primitives.js'
import { parseM3NDocument } from '../m3n-direct.js'
import { parseM3NSyntaxTree } from '../notation/syntax-tree.js'
import { EPSILON, applyEdits, scoreMeasures, beatGroup, spellDuration, type FormatContext } from './shared.js'

type BeamAtom = { raw: string; start: number }
type BeamGroup = { children: BeamNode[] }
type BeamNode = BeamAtom | BeamGroup
type BeamLeaf = { raw: string; start: number; duration: number; carets: number; dots: number }

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
    children.push({ raw, start: index })
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
  const duration = durationInBeats(depth, parsed.carets.length, parsed.dots.length)
  const spelling = spellDuration(node.raw.replace(/[\^.~]/g, ''), duration, node.raw.endsWith('~'), 0, depth)
  return spelling ? [{ ...spelling, start: node.start, duration }] : null
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

function normalizeBeamGroups(source: string, positions: Map<number, { offset: number; beat: number }>, contentStart: number) {
  let output = ''
  for (let index = 0; index < source.length;) {
    if (source.startsWith('//', index)) { output += source.slice(index); break }
    if (source[index] === '{') {
      const end = source.indexOf('}', index)
      if (end >= 0) { output += source.slice(index, end + 1); index = end + 1; continue }
    }
    if (source[index] !== '(') { output += source[index] ?? ''; index += 1; continue }
    const first = parseBeamGroup(source, index)
    if (!first) {
      // An unsupported outer scope still scales every nested note. Never rewrite its interior alone.
      let end = index + 1
      let depth = 1
      for (; end < source.length && depth; end += 1) {
        if (source[end] === '{') {
          const close = source.indexOf('}', end)
          if (close < 0) { end = source.length; break }
          end = close
        } else if (source.startsWith('//', end)) { end = source.length; break }
        else if (source[end] === '(') depth += 1
        else if (source[end] === ')') depth -= 1
      }
      output += source.slice(index, end)
      index = end
      continue
    }
    const nodes = [first.node]
    let end = first.end
    while (true) {
      const whitespace = /^\s+/.exec(source.slice(end))?.[0] ?? ''
      const next = source[end + whitespace.length] === '(' ? parseBeamGroup(source, end + whitespace.length) : null
      if (!next) break
      nodes.push(next.node)
      end = next.end
    }
    const parsedLeaves = nodes.map((node) => beamLeaves(node))
    if (parsedLeaves.some((leaves) => !leaves)) { output += source.slice(index, end); index = end; continue }
    const leaves = parsedLeaves.flat() as BeamLeaf[]
    const units: BeamLeaf[][] = []
    let unit: BeamLeaf[] = []
    const position = positions.get(contentStart + (leaves[0]?.start ?? -1))
    if (!position || !leaves.length) { output += source.slice(index, end); index = end; continue }
    let offset = position.offset
    const beat = position.beat
    for (const leaf of leaves) {
      const boundary = (Math.floor((offset + EPSILON) / beat) + 1) * beat
      if (unit.length && offset + leaf.duration > boundary + EPSILON) { units.push(unit); unit = [] }
      unit.push(leaf)
      offset += leaf.duration
      if (Math.abs(offset / beat - Math.round(offset / beat)) < EPSILON) { units.push(unit); unit = [] }
    }
    if (unit.length) units.push(unit)
    const before = /[0-9a-z#=^.~)\]]/i.test(source[index - 1] ?? '') ? ' ' : ''
    const after = /[0-9[(]/.test(source[end] ?? '') ? ' ' : ''
    output += before + units.map((items) => renderBeamLevel(items, 0)).join(' ') + after
    index = end
  }
  return output
}

/** Rebuild only plain-note scopes, preserving annotated and unknown syntax verbatim. */
export function normalizeGroups(source: string, context?: FormatContext) {
  const score = context?.score ?? parseM3NDocument(source)
  const positions = new Map<number, { offset: number; beat: number }>()
  for (const measure of scoreMeasures(score)) {
    let offset = 0
    for (const event of measure.events) {
      positions.set(event.sourceStart, { offset, beat: beatGroup(event) })
      offset += event.beats
    }
  }
  const edits = (context?.syntaxTree ?? parseM3NSyntaxTree(source)).lines.flatMap(({ row }) => {
    if (!row || !['melody', 'bass', 'alternative'].includes(row.kind)) return []
    return [{ start: row.contentStart, end: row.contentStart + row.content.length,
      value: normalizeBeamGroups(row.content, positions, row.contentStart) }]
  })
  return applyEdits(source, edits)
}
