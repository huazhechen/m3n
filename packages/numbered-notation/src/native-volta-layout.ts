import type { NativeSystem } from './native-layout.js'
import type { NativeRegion } from './native-annotations.js'
import type { TextMeasurer } from './native-measure.js'
import { nativeStyle } from './native-style.js'
import { nativeNoteBody } from './native-note-body.js'
import { nativeMeasureBarPositions } from './native-bars.js'
import { nativeVoltaSvg } from './native-volta.js'
import { nativeSvgInk, nativeSvgPieces } from './native-ink.js'
import { n } from './native-symbols.js'
import { nativeLanePieces } from './native-lanes.js'
import { nativeMusicAxis } from './native-axis.js'
import { nativeRibbonRange } from './native-curve.js'

/** Span identity survives both automatic wrapping and split source measures. */
export function placeNativeVoltas(systems: NativeSystem[], regions: Map<NativeSystem, NativeRegion[]>, measurer: TextMeasurer) {
  const entries = systems.flatMap(system => system.measures.map((measure, index) => ({ system, measure, index })))
  const spans: { begin: number; end: number; ending: string; group: number }[] = []
  for (let begin = 0; begin < entries.length;) {
    const { measure } = entries[begin]!, ending = measure.source.ending
    if (!ending) { begin++; continue }
    let end = begin + 1
    while (end < entries.length && entries[end]!.measure.part === measure.part && entries[end]!.measure.source.ending === ending) end++
    const previous = spans.at(-1)
    const group = previous?.end === begin && entries[previous.begin]!.measure.part === measure.part ? previous.group : begin
    spans.push({ begin, end, ending, group }); begin = end
  }
  const halfBody = nativeNoteBody(measurer).width / 2
  for (const system of systems) {
    const lane = system.lanes.find(lane => lane.id === 'melody')
    if (!lane) continue
    const obstacles = nativeLanePieces(system, measurer, false, false).get(lane.id) ?? []
    const relations = [...(system.relationLayout ?? [])].filter(([relation]) => relation.first.lane === lane.id)
    const fragments = spans.flatMap(span => {
      const members = entries.slice(span.begin, span.end).filter(entry => entry.system === system)
      if (!members.length) return []
      const head = members[0]!, tail = members.at(-1)!
      const glyphs = members.flatMap(({ measure }) => measure.columns.flatMap(column => column.glyphs)).filter(glyph => glyph.lane === lane.id)
      const firstGlyph = glyphs[0], lastGlyph = glyphs.at(-1)
      if (!firstGlyph || !lastGlyph) return []
      const first = head === entries[span.begin], last = tail === entries[span.end - 1]
      const previous = system.measures[head.index - 1]
      const precedingBar = nativeMeasureBarPositions(system.measures, head.index).find(bar => bar.kind === 'rptstart')
        ?? (previous?.part === head.measure.part ? nativeMeasureBarPositions(system.measures, head.index - 1).at(-1) : undefined)
      const next = system.measures[tail.index + 1]
      const followingBar = nativeMeasureBarPositions(system.measures, tail.index).filter(bar => bar.kind !== 'rptstart').at(-1)
        ?? (next?.part === tail.measure.part ? nativeMeasureBarPositions(system.measures, tail.index + 1).find(bar => bar.kind === 'rptstart') : undefined)
      const rawLeft = first ? precedingBar ? precedingBar.x + nativeStyle.music * (5 / 22)
        : firstGlyph.x - (firstGlyph.sustain ? nativeStyle.music * 0.21 : halfBody) : firstGlyph.x - (firstGlyph.musicLeft ?? firstGlyph.left)
      const rawRight = last ? followingBar?.x ?? lastGlyph.x + (lastGlyph.sustain ? nativeStyle.music * 0.21 : halfBody)
        : Math.max(...system.measures.map(measure => measure.end))
      const left = Math.min(rawLeft, rawRight), right = Math.max(rawLeft, rawRight)
      const raw = nativeVoltaSvg(left, right, span.ending, measurer, first, last), ink = nativeSvgInk(raw, measurer)
      let y = nativeMusicAxis(measurer) - nativeStyle.music / 2 - 2 - nativeStyle.music * 0.055 / 2
      for (const mark of nativeSvgPieces(raw, measurer)) {
        const overlaps = obstacles.filter(bound => bound.right > mark.left && bound.left < mark.right)
        for (const bound of overlaps) y = Math.min(y, bound.top - 2 - mark.bottom)
        for (const [, relation] of relations) {
          const pieces = relation.arc ? [nativeRibbonRange(relation.arc, mark.left, mark.right)].filter(bound => bound !== undefined)
            : nativeSvgPieces(relation.svg, measurer).filter(bound => bound.right > mark.left && bound.left < mark.right)
          for (const bound of pieces) y = Math.min(y, bound.top - 2 - mark.bottom)
        }
      }
      return [{ left, right, ending: span.ending, group: span.group, raw, ink, y }]
    })
    // Consecutive endings share a line, independent of the height of each host.
    for (const fragment of fragments) {
      const y = Math.min(...fragments.filter(peer => peer.group === fragment.group).map(peer => peer.y))
      const top = -(y + fragment.ink.top)
      lane.top = Math.max(lane.top, top)
      system.voltas ??= []
      system.voltas.push({ left: fragment.left, right: fragment.right, ending: fragment.ending, top,
        svg: `<g transform="translate(0 ${n(y)})">${fragment.raw}</g>` })
      const bounds = regions.get(system) ?? []
      bounds.push({ lane: lane.id, left: fragment.ink.left, right: fragment.ink.right, top })
      regions.set(system, bounds)
    }
  }
}
