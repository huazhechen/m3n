import type { NativeSystem } from './native-layout.js'
import type { TextMeasurer } from './native-measure.js'
import { nativeSvgPieces, translateNativeInk, type NativeInk } from './native-ink.js'
import { NativeMusicPainter, nativeBeamSvg } from './native-music.js'
import { nativeLyricSvg } from './native-lyrics.js'
import { nativeAnnotationSvg } from './native-annotations.js'
import { nativeBarSvg, nativeMeasureBarPositions } from './native-bars.js'
import { nativeStyle } from './native-style.js'

/** Final painted primitives in each lane's baseline coordinates. Keep separate
 * objects separate: a remote verse or the empty span between parentheses must
 * not become an obstacle across the whole system. */
export function nativeLanePieces(system: NativeSystem, measurer: TextMeasurer): Map<string, NativeInk[]> {
  const painter = new NativeMusicPainter(measurer), result = new Map<string, NativeInk[]>()
  for (const lane of system.lanes) {
    const pieces: NativeInk[] = []
    const add = (svg: string) => pieces.push(...nativeSvgPieces(svg, measurer).filter(ink => ink.right > ink.left && ink.bottom > ink.top))
    for (const [index, measure] of system.measures.entries()) {
      const glyphs = measure.columns.flatMap(column => column.glyphs).filter(glyph => glyph.lane === lane.id)
      for (const glyph of glyphs) {
        add(painter.music({ ...glyph, y: 0 }))
        for (const control of glyph.controls) add(painter.control(control, control.x!, 0))
        for (const annotation of glyph.annotationLayout ?? []) add(nativeAnnotationSvg(annotation, 0, painter))
        for (const [row, baseline] of glyph.lyricBaselines ?? []) {
          const data = glyph.lyrics.get(row)
          if (data && (data.texts.some(text => text.replaceAll('\u200B', '').trim()) || data.annotation)) add(nativeLyricSvg(glyph, row, baseline, system.index, measurer))
        }
      }
      for (let i = 1; i < glyphs.length; i++) add(nativeBeamSvg({ ...glyphs[i - 1]!, y: 0 }, { ...glyphs[i]!, y: 0 }))
      if (glyphs.length && !lane.id.startsWith('alternative:')) for (const bar of nativeMeasureBarPositions(system.measures, index)) add(nativeBarSvg(bar.kind, bar.x, 0, measurer))
    }
    for (const relation of system.relations.filter(relation => relation.first.lane === lane.id)) add(system.relationLayout!.get(relation)!.svg)
    for (const decoration of system.decorationLayout ?? []) if (decoration.lane === lane.id) add(decoration.svg)
    if (lane.id === 'melody') for (const volta of system.voltas ?? []) add(volta.svg)
    result.set(lane.id, pieces)
  }
  return result
}

/** Pack ossia lanes against only horizontally overlapping painted ink. Other
 * full voices retain their ordinary gap; an explicit uniform-height request
 * retains the full lane envelope. Publish offsets before paginating. */
export function placeNativeLanes(system: NativeSystem, measurer: TextMeasurer, uniform = false): number {
  if (uniform || !system.lanes.some(lane => lane.id.startsWith('alternative:'))) {
    let bottom = 0
    for (const [index, lane] of system.lanes.entries()) {
      lane.y = bottom + (index ? nativeStyle.laneGap : 0) + lane.top
      bottom = lane.y + lane.bottom
    }
    return bottom
  }
  const pieces = nativeLanePieces(system, measurer), placed: NativeInk[] = []
  let bottom = 0
  for (const [index, lane] of system.lanes.entries()) {
    const own = pieces.get(lane.id)!
    let y = index ? bottom + nativeStyle.laneGap + lane.top : lane.top
    if (index && lane.id.startsWith('alternative:')) {
      y = system.lanes[0]!.y
      for (const upper of placed) for (const lower of own) {
        if (upper.right >= lower.left && upper.left <= lower.right) y = Math.max(y, upper.bottom + nativeStyle.music * 0.32 - lower.top)
      }
    }
    lane.y = y
    placed.push(...own.map(ink => translateNativeInk(ink, 0, y)))
    bottom = Math.max(bottom, y + lane.bottom)
  }
  // A tall ornament outside the main voice's horizontal range may extend above
  // its top. Preserve the true outer envelope as the pagination block.
  const top = Math.min(0, ...system.lanes.map(lane => lane.y - lane.top))
  for (const lane of system.lanes) lane.y -= top
  return bottom - top
}
