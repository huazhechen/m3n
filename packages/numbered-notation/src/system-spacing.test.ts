import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { compileScore, RecordingPainter } from '@m3n/jpfun'
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
