import { scoreLayoutConfig } from './score-layout-config.js'
import { SCORE_MUSIC_FONT } from './font-family.js'
import symbols from './bravura-symbols.json'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { nativeSvgNumber as n } from './native-svg-number.js'
import { nativeMatrix, transformNativeInk } from './native-transform.js'

export type BravuraGlyph = keyof typeof symbols
/** Measure at a common font size before scaling to the requested ink envelope.
 * Task-local text metrics are shared; no glyph measurements survive a task.
 * The large em avoids pixel rounding inflating small dots and articulation ink. */
export function bravuraGeometry(name: BravuraGlyph, height: number, centered = false, measurer: TextMeasurer = new DefaultTextMeasurer(), width?: number) {
  const create = () => {
    const character = symbols[name].character, fontSize = scoreLayoutConfig.fonts.measurementSize
    const m = measurer.measureText(character, {fontSize,fontFamily:SCORE_MUSIC_FONT,fontWeight:scoreLayoutConfig.fonts.regularWeight,fontStyle:'normal'})
    const bounds = {left:m.inkLeft ?? 0,right:m.inkRight ?? m.w,top:-m.baseline,bottom:-m.baseline+(m.inkBottom ?? m.h)}
    const sy = height / (bounds.bottom-bounds.top), sx = width === undefined ? sy : width / (bounds.right-bounds.left)
    const matrix = Object.freeze(nativeMatrix(sx,0,0,sy,-(centered ? (bounds.left+bounds.right)/2 : bounds.left)*sx,-bounds.top*sy))
    const ink = Object.freeze(transformNativeInk(bounds,matrix))
    const svg = `<text x="0" y="0" font-size="${fontSize}" font-family="${SCORE_MUSIC_FONT}" font-weight="${scoreLayoutConfig.fonts.regularWeight}" fill="#000" aria-hidden="true" data-m3n-font="${SCORE_MUSIC_FONT}" transform="matrix(${matrix.join(' ')})">${character}</text>`
    return Object.freeze({character,fontSize,matrix,ink,svg,width:ink.right-ink.left,height:ink.bottom-ink.top})
  }
  return measurer.fixedSymbol ? measurer.fixedSymbol(`Bravura:${name}:${height}:${centered}:${width}`,create) : create()
}
export const bravuraGlyph = bravuraGeometry
export const bravuraSvg = (name: BravuraGlyph, height: number, measurer?: TextMeasurer) => bravuraGlyph(name,height,true,measurer).svg
/** Attached dots are geometric circles, independent of font ink and hinting. */
export function nativeDotInk(x: number, y: number, radius: number, _measurer: TextMeasurer) {
  const cx = n(x), cy = n(y), r = n(radius)
  return { left: cx - r, right: cx + r, top: cy - r, bottom: cy + r }
}
export function nativeDotSvg(x: number, y: number, radius: number, measurer: TextMeasurer, repeat = false) {
  if (!repeat) return `<circle data-m3n-role="music-dot" cx="${n(x)}" cy="${n(y)}" r="${n(radius)}" fill="#000" aria-hidden="true"/>`
  const glyph = bravuraGlyph('repeatDot',radius*2,true,measurer,radius*2)
  return `<g data-m3n-role="music-dot" transform="translate(${n(x)} ${n(y-radius)})">${glyph.svg}</g>`
}
