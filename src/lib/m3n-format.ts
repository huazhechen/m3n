import { splitSupplementBlocks } from './notation/supplements'
import { durationInBeats, parseM3NNote } from './notation/m3n-primitives'

const BARLINE = /(:\|\|\||:\|\|:|:\|\||\|\|:|\|\|\||\|\||\|)/g
const EPSILON = 1e-9

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

function formatMusic(source: string) {
  const commentBreak = '\u0000'
  const compact = normalizeBeamGroups(source)
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
  return lines.join('\n')
}

function formatMain(source: string) {
  const header = /^.*\{key=[^\n]+$/m.exec(source)
  if (!header || header.index === undefined) return formatMusic(source)
  const headerEnd = header.index + header[0].length
  const music = source.slice(headerEnd).trim()
  return `${source.slice(0, headerEnd).trimEnd()}\n${formatMusic(music)}`
}

/** Formats M3N source without changing its musical or lyric content. */
export function formatM3N(source: string) {
  const { main, bass, lyrics } = splitSupplementBlocks(source)
  const supplements = [
    ...lyrics.map((lyric) => {
      const text = lyric.mode === 'char' ? lyric.text.replace(/\s+/g, '') : lyric.text.replace(/\s+/g, ' ').trim()
      const name = lyric.mode === 'word' ? 'lyrics-word' : 'lyrics'
      return `{${name}${lyric.range ? `=${lyric.range}` : ''}}\n${text}\n{/}`
    }),
    bass ? `{bass}\n${formatMusic(bass)}\n{/}` : '',
  ].filter(Boolean)
  return `${formatMain(main)}${supplements.length > 0 ? `\n\n${supplements.join('\n\n')}` : ''}\n`
}
