import type { NativeSystem } from './native-layout.js'
import type { TextMeasurer } from './native-measure.js'
import { nativeSvgPieces, type NativeInk } from './native-ink.js'
import { NativeMusicPainter, nativeBeamLayout } from './native-music.js'
import { nativeLyricPieces } from './native-lyrics.js'
import { nativeAnnotationSvg } from './native-annotations.js'
import { nativeBarPieces, nativeLaneBarPositions } from './native-bars.js'
import { nativeCoreGap } from './native-style.js'

/** Final painted primitives in each lane's baseline coordinates. Keep separate
 * objects separate: a remote verse or the empty span between parentheses must
 * not become an obstacle across the whole system. */
export function nativeLanePieces(system: NativeSystem, measurer: TextMeasurer, coreOnly = false, includeRelations = true): Map<string, NativeInk[]> {
  const painter = new NativeMusicPainter(measurer), result = new Map<string, NativeInk[]>()
  for (const lane of system.lanes) {
    const pieces: NativeInk[] = []
    const add = (svg: string) => pieces.push(...nativeSvgPieces(svg, measurer).filter(ink => ink.right > ink.left && ink.bottom > ink.top))
    for (const [index, measure] of system.measures.entries()) {
      const glyphs = measure.columns.flatMap(column => column.glyphs).filter(glyph => glyph.lane === lane.id).map(glyph => ({ ...glyph, y: 0 }))
      const beams = nativeBeamLayout(glyphs, measurer, false)
      for (const glyph of glyphs) {
        pieces.push(...painter.musicPieces(glyph, beams.claimed.get(glyph), coreOnly).filter(ink => ink.right > ink.left && ink.bottom > ink.top))
        for (const control of coreOnly ? [] : glyph.controls) add(painter.control(control, control.x!, 0))
        for (const annotation of coreOnly ? [] : glyph.annotationLayout ?? []) add(nativeAnnotationSvg(annotation, 0, painter))
        for (const [row, baseline] of glyph.lyricBaselines ?? []) {
          const data = glyph.lyrics.get(row)
          if (data && (data.texts.some(text => text.replaceAll('\u200B', '').trim()) || data.annotation)) pieces.push(...nativeLyricPieces(data, glyph.x, baseline, measurer, glyph.lyricHyphenEnds?.get(row)).filter(ink => ink.right > ink.left && ink.bottom > ink.top))
        }
      }
      pieces.push(...beams.pieces)
      if (!coreOnly) for (const bar of nativeLaneBarPositions(system.measures, index, lane.id)) pieces.push(...nativeBarPieces(bar.kind, bar.x, 0, measurer))
    }
    if (includeRelations && !coreOnly) for (const relation of system.relations.filter(relation => relation.first.lane === lane.id)) add(system.relationLayout!.get(relation)!.svg)
    if (!coreOnly) for (const decoration of system.decorationLayout ?? []) if (decoration.lane === lane.id && !decoration.svg.includes('data-m3n-role="measure-number"')) add(decoration.svg)
    if (includeRelations && !coreOnly && lane.id === 'melody') for (const volta of system.voltas ?? []) add(volta.svg)
    result.set(lane.id, pieces)
  }
  return result
}

/** Stack the complete melody and bass envelopes with their ordinary gap. */
export function placeNativeLanes(system: NativeSystem): number {
  let bottom = 0
  for (const [index, lane] of system.lanes.entries()) {
    lane.y = bottom + (index ? ((system.coreGap ?? nativeCoreGap()) * .7) : 0) + lane.top
    bottom = lane.y + lane.bottom
  }
  return bottom
}
