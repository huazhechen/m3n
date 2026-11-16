import { nativeStyle } from './native-style.js'
import type { NativeSystem } from './native-layout.js'
import type { NativeAnnotation } from './native-model.js'
import type { TextMeasurer } from './native-measure.js'

export type NativeRegion = { lane: string; left: number; right: number; top: number }

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
      const w = metrics.w + 2 * padding, h = metrics.h + 2 * padding
      const left = framed ? margin : Math.max(margin, Math.min(glyph.x - w / 2, width - margin - w))
      const right = left + w
      const obstacleTop = Math.max(glyph.musicTop ?? glyph.top, ...regions.filter(region => region.lane === glyph.lane && region.right >= left && region.left <= right).map(region => region.top))
      const top = obstacleTop + nativeStyle.annotation * (local ? 0.4 : 0.5) + h
      const item: NativeAnnotation = { text, kind, x: left + w / 2, top, width: w, height: h, baseline: -top + padding + metrics.baseline }
      glyph.annotationLayout ??= []
      glyph.annotationLayout.push(item)
      regions.push({ lane: glyph.lane, left, right, top })
      const lane = system.lanes.find(lane => lane.id === glyph.lane)!
      lane.top = Math.max(lane.top, top)
    }
  }
}
