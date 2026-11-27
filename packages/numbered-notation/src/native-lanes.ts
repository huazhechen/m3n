import { isNativeMeasureNumber } from './native-system-labels.js'
import type { NativeSystem } from './native-layout-model.js'
import type { TextMeasurer } from './native-measure.js'
import { nativeSvgPieces, type NativeInk } from './native-ink.js'
import { NativeMusicPainter, nativeBeamLayout } from './native-music.js'
import { placedNativeLyricPieces } from './native-lyrics.js'
import { nativeAnnotationSvg } from './native-annotations.js'
import { nativeBarPieces, nativeLaneBarPositions } from './native-bars.js'
import { nativeInnerMark } from './native-marks.js'
import { placedNativeControlInk } from './native-controls.js'
import { nativeAnnotationPieces } from './native-annotations.js'
import { nativeRibbonRange } from './native-curve.js'
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
      const members=[]
      for(const column of measure.columns)for(const glyph of column.glyphs)if(glyph.lane===lane.id)members.push(glyph)
      const glyphs = system.numericGeometry ? members : members.map(glyph => ({ ...glyph, y: 0 }))
      const beams = nativeBeamLayout(glyphs, measurer, false, system.numericGeometry ? {baseline:0,claim:false} : undefined)
      for (const glyph of glyphs) {
        const cached = coreOnly ? glyph.coreInk : glyph.musicInk
        if(system.numericGeometry && cached) {
          for(const piece of cached) {
            const left=piece.left+glyph.x,right=piece.right+glyph.x
            if(right>left && piece.bottom>piece.top)pieces.push({left,right,top:piece.top,bottom:piece.bottom})
          }
        } else for(const piece of painter.musicPieces(system.numericGeometry ? {...glyph,y:0} : glyph, beams.claimed.get(glyph), coreOnly))
          if(piece.right>piece.left && piece.bottom>piece.top)pieces.push(piece)
        if (system.numericGeometry && !coreOnly) for (const mark of glyph.markLayout ?? []) {
          const left=glyph.x+mark.left,right=glyph.x+mark.right,bottom=mark.top+mark.height
          if (!nativeInnerMark(mark.name) && right>left && bottom>mark.top) pieces.push({ left, right,
            top: mark.top, bottom })
        }
        for (const control of coreOnly ? [] : glyph.controls) {
          if (system.numericGeometry) pieces.push(...placedNativeControlInk(control))
          else add(painter.control(control, control.x!, 0))
        }
        for (const annotation of coreOnly ? [] : glyph.annotationLayout ?? []) {
          if (system.numericGeometry) pieces.push(...nativeAnnotationPieces(annotation, measurer))
          else add(nativeAnnotationSvg(annotation, 0, painter))
        }
        for (const [row, baseline] of glyph.lyricBaselines ?? []) {
          const data = glyph.lyrics.get(row)
          if (data && (data.texts.some(text => text.replaceAll('\u200B', '').trim()) || data.annotation))for(const ink of placedNativeLyricPieces(glyph,row,baseline,measurer))
            if(ink.right>ink.left && ink.bottom>ink.top)pieces.push(ink)
        }
      }
      pieces.push(...beams.pieces)
      if (!coreOnly) for (const bar of nativeLaneBarPositions(system.measures, index, lane.id)) pieces.push(...nativeBarPieces(bar.kind, bar.x, 0, measurer))
    }
    if (includeRelations && !coreOnly) for (const relation of system.relations.filter(relation => relation.first.lane === lane.id)) {
      const placed = system.relationLayout!.get(relation)!
      if (system.numericGeometry && placed.arc) {
        // Conservative analytic bounds in narrow horizontal strips let distant
        // elements interleave without turning a bow into a full-width box.
        for (let left = placed.arc.left; left < placed.arc.right; left += 8) {
          const right = Math.min(left + 8, placed.arc.right), range = nativeRibbonRange(placed.arc, left, right)
          if (range) pieces.push({ left, right, ...range })
        }
      } else if (system.numericGeometry && placed.pieces) pieces.push(...placed.pieces)
      else add(placed.svg)
    }
    if (!coreOnly) for (const decoration of system.decorationLayout ?? []) if (decoration.lane === lane.id && !isNativeMeasureNumber(decoration)) add(decoration.svg)
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
