import type { TextMeasurer } from './native-measure.js'
import { bravuraGlyph, type BravuraGlyph } from './bravura.js'
import { nativeStyle } from './native-style.js'
const glyphs: Record<string, BravuraGlyph> = { p: 'dynamicPiano', pp: 'dynamicPP', ppp: 'dynamicPPP', f: 'dynamicForte', ff: 'dynamicFF', fff: 'dynamicFFF', mp: 'dynamicMP', mf: 'dynamicMF', sfz: 'dynamicSforzato' }
export function nativeDynamicGlyph(name: string, size = nativeStyle.small, measurer?: TextMeasurer) {
  const glyph = glyphs[name]
  if (!glyph) return undefined
  const shape = bravuraGlyph(glyph, size * (name.includes('f') ? 1 : .79341), true, measurer)
  return shape
}
