import { nativeStyle, nativeEm as em } from './native-style.js'
import { NativeSymbols, attrs } from './native-symbols.js'
import type { NativeSystem } from './native-layout.js'
import type { NativeAnnotation } from './native-model.js'
import type { TextMeasurer } from './native-measure.js'

export type NativeRegion = { lane: string; left: number; right: number; top: number }

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
      const inkLeft = Math.min(0, metrics.inkLeft ?? 0), inkRight = Math.max(metrics.w, metrics.inkRight ?? metrics.w)
      const w = inkRight - inkLeft + 2 * padding, h = metrics.h + 2 * padding
      const first = measurer.measureText([...text][0]!, { fontSize: nativeStyle.annotation, fontFamily: 'serif', fontWeight: framed ? 700 : 400 })
      // Match the text control's first-character anchor, while reserving the
      // union of logical advance and actual paint for clamping and avoidance.
      const left = framed ? margin : Math.max(margin, Math.min(glyph.x - first.w / 2 + inkLeft, width - margin - w))
      const right = left + w
      const obstacleTop = Math.max(glyph.musicTop ?? glyph.top, ...regions.filter(region => region.lane === glyph.lane && region.right >= left && region.left <= right).map(region => region.top))
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
