/** Design metrics from the bundled Bravura.woff2 (1000 units per em).
 * SMuFL glyphs, including their true ink bearings rather than text advances. */
import characters from './bravura-characters.json'
export const bravuraAccidentalCharacters = characters

export function defaultBravuraCharacterMetrics(text: string, size: number) {
  const glyph = Object.values(bravuraAccidentalCharacters).find(glyph => glyph.character === text)
  if (!glyph) return undefined
  const advance = glyph.width * size, baseline = glyph.ascent * size, bottom = glyph.descent * size
  return { w: Math.max(advance, size * .25), advance, h: baseline + bottom, baseline,
    inkBottom: baseline + bottom, inkLeft: 0, inkRight: advance, centerOffset: 0 }
}
