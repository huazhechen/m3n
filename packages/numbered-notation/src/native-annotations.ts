import { nativeStyle, nativeEm as em } from './native-style.js'
import { NativeSymbols, attrs } from './native-symbols.js'
import type { NativeSystem } from './native-layout.js'
import type { NativeAnnotation } from './native-model.js'
import type { TextMeasurer } from './native-measure.js'
import type { NativeArc } from './native-arc.js'
import { nativeRibbonRange } from './native-curve.js'

export type NativeRegion = { lane: string; left: number; right: number; top: number; arc?: NativeArc }
export function nativeRegionTop(region: NativeRegion, left: number, right: number) {
  return region.arc ? -(nativeRibbonRange(region.arc, left, right)?.top ?? -region.top) : region.top
}

/** Final annotation primitives, shared by painting and inter-lane clearance. */
export function nativeAnnotationSvg(annotation: NativeAnnotation, y: number, painter: NativeSymbols, meta: Record<string, string | number | undefined> = {}): string {
  const { text, x, textX, baseline, width, height, top, kind } = annotation, framed = kind === 'section'
  const label = painter.text(text, textX, y + baseline, nativeStyle.annotation, 'serif', { 'font-weight': framed ? 700 : 400, ...meta, 'data-m3n-role': 'annotation' })
  return framed ? `<g data-m3n-role="annotation-frame"><rect${attrs({ x: x - width / 2 + em(0.5), y: y - top + em(0.5), width: width - em(1), height: height - em(1), stroke: '#000', 'stroke-width': em(1), fill: 'none' })}/>${label}</g>` : label
}

/** Place attachments above only the music and earlier attachments they cover.
 * Coordinates are lane-relative; pagination and uniform spacing cannot move
 * a label relative to its own note or feed its height back into an arc.
 */
export function placeNativeAnnotations(system: NativeSystem, regions: NativeRegion[], measurer: TextMeasurer,
  width: number, margin: number, local: boolean) {
  const glyphs = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs))
  for (const kind of local ? ['text', 'section'] as const : ['chord'] as const) {
    for (const glyph of glyphs) {
      const text = kind === 'chord' ? glyph.event?.chord : kind === 'text' ? glyph.event?.text
        : glyph.event?.sectionLabelBreakAfter ? glyph.event.sectionLabel : undefined
      if (!text || !glyph.annotations.includes(text)) continue
      const framed = kind === 'section', padding = framed ? nativeStyle.annotation * 0.25 : 0
      const metrics = measurer.measureText(text, { fontSize: nativeStyle.annotation, fontFamily: 'serif', fontWeight: framed ? 700 : 400 })
      const inkLeft = framed ? Math.min(0, metrics.inkLeft ?? 0) : metrics.inkLeft ?? 0
      const inkRight = framed ? Math.max(metrics.w, metrics.inkRight ?? metrics.w) : metrics.inkRight ?? metrics.w
      const w = inkRight - inkLeft + 2 * padding, h = metrics.h + 2 * padding
      const first = measurer.measureText([...text][0]!, { fontSize: nativeStyle.annotation, fontFamily: 'serif', fontWeight: framed ? 700 : 400 })
      // Keep the first-character anchor, but only painted text or a visible
      // frame can touch a margin or require clearance over nearby music.
      const left = framed ? margin : Math.max(margin, Math.min(glyph.x - first.w / 2 + inkLeft, width - margin - w))
      const right = left + w
      const queryLeft = framed ? Math.min(left, glyph.x - (glyph.inkLeft ?? glyph.left)) : left
      const queryRight = framed ? Math.max(right, glyph.x + (glyph.inkRight ?? glyph.right)) : right
      const obstacleTop = Math.max(0, ...regions.filter(region => region.lane === glyph.lane && region.right >= queryLeft && region.left <= queryRight).map(region => nativeRegionTop(region, queryLeft, queryRight)))
      const top = obstacleTop + nativeStyle.annotation * (local ? 0.4 : 0.5) + h
      const item: NativeAnnotation = { text, kind, x: left + w / 2, textX: left + padding - inkLeft, top, width: w, height: h, baseline: -top + padding + metrics.baseline }
      glyph.annotationLayout ??= []
      glyph.annotationLayout.push(item)
      regions.push({ lane: glyph.lane, left, right, top })
      const lane = system.lanes.find(lane => lane.id === glyph.lane)!
      lane.top = Math.max(lane.top, top)
    }
  }
}
