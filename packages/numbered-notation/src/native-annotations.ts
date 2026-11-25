import { SCORE_TEXT_FONT, SCORE_TEXT_WEIGHT } from './font-family.js'
import { nativeStyle } from './native-style.js'
import { NativeSymbols, attrs } from './native-symbols.js'
import type { NativeSystem } from './native-layout.js'
import type { NativeAnnotation } from './native-model.js'
import type { TextMeasurer } from './native-measure.js'
import type { NativeArc } from './native-arc.js'
import { nativeRibbonRange } from './native-curve.js'

export type NativeRegion = { lane: string; left: number; right: number; top: number; arc?: NativeArc; headingClearance?: number }
export function nativeRegionTop(region: NativeRegion, left: number, right: number) {
  return region.arc ? -(nativeRibbonRange(region.arc, left, right)?.top ?? -region.top) : region.top
}

/** Final annotation primitives, shared by painting and inter-lane clearance. */
export function nativeAnnotationSvg(annotation: NativeAnnotation, y: number, painter: NativeSymbols, meta: Record<string, string | number | undefined> = {}): string {
  const { text, x, textX, baseline, width, height, top, kind } = annotation, framed = kind === 'section'
  const label = painter.text(text, textX, y + baseline, nativeStyle.annotation, SCORE_TEXT_FONT, { 'font-weight': framed ? 700 : SCORE_TEXT_WEIGHT, ...meta, 'data-m3n-role': 'annotation' })
  return framed ? `<g data-m3n-role="annotation-frame"><rect${attrs({ x: x - width / 2 + 0.5, y: y - top + 0.5, width: width - 1, height: height - 1, stroke: '#000', 'stroke-width': 1, fill: 'none' })}/>${label}</g>` : label
}

/** Local descriptions clear covered ink; standalone headings share the lane's
 * core reference. Coordinates are lane-relative, independent of pagination;
 * annotation height cannot feed back into an arc.
 */
export function placeNativeAnnotations(system: NativeSystem, regions: NativeRegion[], measurer: TextMeasurer,
  width: number, margin: number, local: boolean, coreTops?: ReadonlyMap<string, number>) {
  const glyphs = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs))
  for (const kind of local ? ['text', 'section'] as const : ['chord'] as const) {
    for (const glyph of glyphs) {
      const text = kind === 'chord' ? glyph.event?.chord : kind === 'text' ? glyph.event?.text
        : glyph.event?.sectionLabelBreakAfter ? glyph.event.sectionLabel : undefined
      if (!text || !glyph.annotations.includes(text)) continue
      const framed = kind === 'section', padding = framed ? nativeStyle.annotation * 0.25 : 0
      const metrics = measurer.measureText(text, { fontSize: nativeStyle.annotation, fontFamily: SCORE_TEXT_FONT, fontWeight: framed ? 700 : SCORE_TEXT_WEIGHT })
      const inkLeft = framed ? Math.min(0, metrics.inkLeft ?? 0) : metrics.inkLeft ?? 0
      const inkRight = framed ? Math.max(metrics.w, metrics.inkRight ?? metrics.w) : metrics.inkRight ?? metrics.w
      const w = inkRight - inkLeft + 2 * padding, h = metrics.h + 2 * padding
      const first = measurer.measureText([...text][0]!, { fontSize: nativeStyle.annotation, fontFamily: SCORE_TEXT_FONT, fontWeight: framed ? 700 : SCORE_TEXT_WEIGHT })
      // Keep the first-character anchor, but only painted text or a visible
      // frame can touch a margin or require clearance over nearby music.
      const left = framed ? margin : Math.max(margin, Math.min(glyph.x - first.w / 2 + inkLeft, width - margin - w))
      const right = left + w
      // A standalone heading clears the whole lane's core, then only those
      // decorations its frame actually covers; the first note is not its footprint.
      const gap = framed ? nativeStyle.sectionHeadingGap : local ? nativeStyle.annotationGap : nativeStyle.chordGap
      const bottom = Math.max((framed ? coreTops?.get(glyph.lane) ?? 0 : 0) + gap,
        ...regions.filter(region => region.lane === glyph.lane && region.right >= left && region.left <= right)
          .map(region => nativeRegionTop(region, left, right) + (framed ? region.headingClearance ?? gap : gap)))
      const top = bottom + h
      const item: NativeAnnotation = { text, kind, x: left + w / 2, textX: left + padding - inkLeft, top, width: w, height: h, baseline: -top + padding + metrics.baseline }
      glyph.annotationLayout ??= []
      glyph.annotationLayout.push(item)
      regions.push({ lane: glyph.lane, left, right, top })
      const lane = system.lanes.find(lane => lane.id === glyph.lane)!
      lane.top = Math.max(lane.top, top)
    }
  }
}
