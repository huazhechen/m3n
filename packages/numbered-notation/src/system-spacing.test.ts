import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { compileScore, RecordingPainter, getLayoutBounds } from '@m3n/jpfun'
import { projectNumberedScore } from './projection.js'
import { layoutNativeScore } from './native-layout.js'
import { nativeLanePieces } from './native-lanes.js'

const source = '{2/4}\nN: ||: 1 2 | {br} 3 4 | {br} 5 6 :|||\nB: 1d 2d | 3d 4d | 5d 6d |\nL1: 春风 | 吹来 | 花开\nL2: 高山上 | 轻轻开 | 花开\nNs[2]: 1: (1eee 2eee) 3eee | (5 6) 7 |'
const measurer = { measureText(text: string, style: { fontSize: number }) { return { w: text.length * style.fontSize / 2, h: style.fontSize, baseline: style.fontSize * .8 } } }

it.each([false, true])('keeps all voice and lyric cores 24px apart, including ossia lyrics, paged=%s', paged => {
  const document = parseM3NDocument(source), options = { width: 600, paged, textMeasurer: measurer }
  const projection = projectNumberedScore(document, options)
  const result = compileScore(projection.source, { textMeasurer: measurer, autoWrap: true, systemSpacing: { coreGap: 24, inkGap: 12 } })
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  const rows = new Map<number, { top: number; bottom: number }>()
  const include = (line: number, top: number, bottom: number) => {
    const previous = rows.get(line)
    rows.set(line, { top: Math.min(previous?.top ?? Infinity, top), bottom: Math.max(previous?.bottom ?? -Infinity, bottom) })
  }
  const notes = result.layout.objects.filter(n => !n.T.isZero())
  expect(notes.some(n => n.track.alternative)).toBe(true)
  for (const node of notes) {
    const painter = new RecordingPainter()
    node.paintCore(painter)
    for (const decoration of node.decorations) if (decoration.systemCore) decoration.paint?.(painter)
    for (const command of painter.commands) {
      if (command.kind === 'text') {
        const metrics = measurer.measureText(command.text, command.style)
        include(node.layoutLine, command.y - metrics.baseline, command.y - metrics.baseline + metrics.h)
      } else if (command.kind === 'circle') include(node.layoutLine, command.cy - command.r, command.cy + command.r)
      else if (command.kind === 'line') {
        const half = (command.style?.strokeWidth ?? 1) / 2
        include(node.layoutLine, Math.min(command.y1, command.y2) - half, Math.max(command.y1, command.y2) + half)
      } else throw new Error(`Unexpected core primitive: ${command.kind}`)
    }
  }
  let alternativeLyrics = 0
  for (const attachment of result.layout.attachments) {
    const painter = new RecordingPainter()
    attachment.paint(painter)
    if (!painter.commands.some(c => c.kind === 'text' && c.style.semantic?.role === 'lyric')) continue
    for (const region of attachment.regions) if (region.line !== undefined) {
      include(region.line, region.y, region.y + region.h)
      if (region.track.alternative) alternativeLyrics++
    }
  }
  expect(alternativeLyrics).toBeGreaterThan(0)
  const entries = [...rows].sort(([a], [b]) => a - b)
  expect(entries.length).toBe(3)
  let checked = 0
  for (const page of result.layout.pages) for (let i = 1; i < entries.length; i++) {
    if (entries[i - 1]![0] < page.lineStart || entries[i]![0] >= page.lineEnd) continue
    expect(entries[i]![1].top - entries[i - 1]![1].bottom).toBeCloseTo(24)
    checked++
  }
  expect(checked).toBeGreaterThan(0)
  const native = layoutNativeScore(document, options)
  expect(native.systems.some(s => s.lanes.some(l => l.id.startsWith('alternative:')))).toBe(true)
  const cores = native.systems.map(system => {
    const pieces = nativeLanePieces(system, measurer, true)
    const ink = system.lanes.flatMap(lane => pieces.get(lane.id)!.map(r => ({ top: r.top + lane.y, bottom: r.bottom + lane.y })))
    return { top: Math.min(...ink.map(r => r.top)), bottom: Math.max(...ink.map(r => r.bottom)) }
  })
  for (let i = 1; i < native.systems.length; i++) if (native.systems[i]!.page === native.systems[i - 1]!.page)
    expect(cores[i]!.top - cores[i - 1]!.bottom).toBeCloseTo(24)
})

it.each([
  { kind: 'slur', music: '{lg}1 2 3 4{/}' },
  { kind: 'tie', music: '1~ (1) (2) 3 4' },
  { kind: 'tuplet', music: '[1 2 3:2] 4 5' },
])('keeps $kind strokes and labels outside the core with local collision clearance', ({ kind, music }) => {
  const document = parseM3NDocument(`{4/4}\nN: 1 2 3 4 | {br} ${music} |||`)
  const options = { width: 600, paged: false, textMeasurer: measurer }
  const projection = projectNumberedScore(document, options)
  const result = compileScore(projection.source, { textMeasurer: measurer, autoWrap: true, systemSpacing: { coreGap: 24, inkGap: 12 } })
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  const musicLines = [...new Set(result.layout.objects.filter(n => !n.T.isZero()).map(n => n.layoutLine))]
  expect(musicLines.length).toBe(2)
  const previousBottom = Math.max(...result.layout.objects.filter(n => n.layoutLine === musicLines[0] && !n.T.isZero()).map(n => { const b = getLayoutBounds(n); return b.y + b.h }))
  const marks = result.layout.attachments.filter(a => {
    const text = a.sourceSpan && projection.source.slice(a.sourceSpan.start, a.sourceSpan.end)
    return text && (text.startsWith('@tie(') || text.startsWith('@tuplet('))
  }).flatMap(a => a.regions).filter(r => r.line === musicLines[1])
  expect(marks.length).toBeGreaterThan(0)
  // A remote bracket may rise into empty horizontal space, but never
  // demands the full 24px core clearance.
  expect(Math.min(...marks.map(r => r.y)) - previousBottom).toBeLessThan(24)
  const native = layoutNativeScore(document, options)
  expect(native.relations.some(r => r.kind === kind)).toBe(true)
  const cores = native.systems.map(system => {
    const pieces = nativeLanePieces(system, measurer, true)
    const ink = system.lanes.flatMap(lane => pieces.get(lane.id)!.map(r => ({ top: lane.y + r.top, bottom: lane.y + r.bottom })))
    return { top: Math.min(...ink.map(r => r.top)), bottom: Math.max(...ink.map(r => r.bottom)) }
  })
  expect(cores[1]!.top - cores[0]!.bottom).toBeGreaterThanOrEqual(24 - 1e-6)
  const ink = nativeLanePieces(native.systems[1]!, measurer).get('melody')!
  expect(Math.min(...ink.map(piece => native.systems[1]!.lanes[0]!.y + piece.top)) - cores[0]!.bottom).toBeLessThan(24)
  const previousInk = nativeLanePieces(native.systems[0]!, measurer).get('melody')!
  let checked = 0
  for (const upper of previousInk) for (const lower of ink) {
    if (upper.right <= lower.left || upper.left >= lower.right) continue
    expect(native.systems[1]!.lanes[0]!.y + lower.top - native.systems[0]!.lanes[0]!.y - upper.bottom).toBeGreaterThanOrEqual(12 - 1e-6)
    checked++
  }
  expect(checked).toBeGreaterThan(0)
})

it('excludes grace notes from the native core while keeping their painted ink for collisions', () => {
  const native = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1{ac(7eee)} 2 3 4 |||'), { width: 600, paged: false, textMeasurer: measurer })
  const system = native.systems[0]!
  const core = nativeLanePieces(system, measurer, true).get('melody')!
  const ink = nativeLanePieces(system, measurer).get('melody')!
  expect(Math.min(...ink.map(r => r.top))).toBeLessThan(Math.min(...core.map(r => r.top)))
  expect(Math.max(...core.map(r => r.bottom)) - Math.min(...core.map(r => r.top))).toBeCloseTo(22)
})
