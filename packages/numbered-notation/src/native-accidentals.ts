import { scoreLayoutConfig } from './score-layout-config.js'
import { SCORE_MUSIC_FONT } from './font-family.js'
import { bravuraAccidentalCharacters } from './bravura-characters.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { nativeSvgNumber as n } from './native-svg-number.js'
import type { NativeInk } from './native-ink.js'

export type NativeAccidentalGlyph = { symbol: string; character: string; fontSize: number; x: number; y: number; ink: NativeInk }
const height = (symbol: string, size: number) => (symbol === '♯' ? .78 : .82) * size * .72 * scoreLayoutConfig.numbered.accidentalScale
function measuredGlyphs(symbols: string, size: number, measurer: TextMeasurer) {
  return [...symbols].flatMap(symbol => {
    const glyph = bravuraAccidentalCharacters[symbol as keyof typeof bravuraAccidentalCharacters]
    if (!glyph) return []
    // Preserve the intended ink height, not a nominal font em size.
    const fontSize = n(height(symbol, size) / (glyph.ascent + glyph.descent))
    const metrics = measurer.measureText(glyph.character, { fontSize, fontFamily: SCORE_MUSIC_FONT, fontWeight: scoreLayoutConfig.fonts.regularWeight, fontStyle: 'normal' })
    const width = (metrics.inkRight ?? metrics.w) - (metrics.inkLeft ?? 0)
    return [{ symbol, character: glyph.character, fontSize, ascent: glyph.ascent, metrics, width }]
  })
}
export function nativeAccidentalAdvance(symbols: string, size: number, measurer: TextMeasurer = new DefaultTextMeasurer()): number {
  return measuredGlyphs(symbols, size, measurer).reduce((sum, glyph) => sum + glyph.width + size * .035, 0)
}
export function nativeAccidentalGeometry(symbols: string, size: number, numberHalfWidth: number, measurer: TextMeasurer = new DefaultTextMeasurer()) {
  const measured = measuredGlyphs(symbols, size, measurer)
  const advance = measured.reduce((sum, glyph) => sum + glyph.width + size * .035, 0)
  let left = -numberHalfWidth - advance
  const glyphs: NativeAccidentalGlyph[] = measured.map(({ symbol, character, fontSize, ascent, metrics, width }) => {
    const top = -size * .42 - (symbol === '♯' ? .63 : .67) * size * .72 * scoreLayoutConfig.numbered.accidentalScale
    // Keep the font outline at its original design position; Canvas ink may
    // reserve a slightly larger hinted envelope, which still enters avoidance.
    const x = n(left - (metrics.inkLeft ?? 0)), y = n(top + fontSize * ascent)
    const ink = { left: x + (metrics.inkLeft ?? 0), right: x + (metrics.inkRight ?? metrics.w),
      top: y - metrics.baseline, bottom: y - metrics.baseline + (metrics.inkBottom ?? metrics.h) }
    left += width + size * .035
    return { symbol, character, fontSize, x, y, ink }
  })
  return { advance, glyphs }
}
