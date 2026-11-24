/** Design metrics from the bundled Bravura.woff2 (1000 units per em).
 * SMuFL glyphs, including their true ink bearings rather than text advances. */
import characters from './bravura-characters.json'
import symbols from './bravura-symbols.json'
export const bravuraAccidentalCharacters = characters

type BravuraDesign = { character: string; width: number; ascent: number; descent: number; left?: number; advance?: number }
const byCharacter = new Map<string,BravuraDesign>([...Object.values(characters), ...Object.values(symbols)].map(glyph => [glyph.character, glyph]))
export function defaultBravuraCharacterMetrics(text: string, size: number) {
  const glyph = byCharacter.get(text)
  if (!glyph) return undefined
  const left = (glyph.left ?? 0) * size
  const advance = (glyph.advance ?? glyph.width) * size
  const baseline = glyph.ascent * size, bottom = glyph.descent * size
  return { w: Math.max(advance, size * .25), advance, h: baseline + bottom, baseline,
    inkBottom: baseline + bottom, inkLeft: left, inkRight: left + glyph.width * size, centerOffset: 0 }
}
