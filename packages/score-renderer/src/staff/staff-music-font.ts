import glyphs from './staff-glyphs.json' with { type: 'json' }
import { element, type Ink, type XmlNode } from './layout-svg.js'

export type StaffGlyph = keyof typeof glyphs
export const STAFF_MUSIC_SIZE = 40 // SMuFL: one em = four staff spaces.
export const staffGlyphMetrics = (name: StaffGlyph, size = STAFF_MUSIC_SIZE) => {
  const g = glyphs[name]
  return { left: g.left * size, right: g.right * size, top: g.top * size, bottom: g.bottom * size, advance: g.advance * size }
}
const characters = new Map(Object.values(glyphs).map(g => [g.character, g]))
/** Also used when reading back SVG, with the very same distributed font. */
export function staffCharacterInk(value: string, size: number, x: number, y: number): Ink[] {
  const result: Ink[] = []
  for (const character of value) {
    const g = characters.get(character)
    if (!g) throw new Error(`五线谱音乐字体缺少字符：${character}`)
    for (const [left, top, right, bottom] of g.boxes)
      result.push({ left: x + left! * size, right: x + right! * size, top: y + top! * size, bottom: y + bottom! * size })
    x += g.advance * size
  }
  return result
}
/** Candidates allocate numeric ink only. Text attributes are created at output. */
export function staffGlyph(name: StaffGlyph, x: number, y: number, size = STAFF_MUSIC_SIZE): XmlNode {
  return new MusicCharacter(name, x, y, size)
}
class MusicCharacter implements XmlNode {
  readonly tagName = 'g'
  readonly attributes = { class: 'm3n-music-glyph' }
  readonly children: Array<XmlNode | string> = []
  readonly numericInk: Ink[]
  constructor(private readonly name: StaffGlyph, private readonly x: number, private readonly y: number, private readonly size: number) {
    this.numericInk = staffCharacterInk(glyphs[name].character, size, x, y)
  }
  renderNodes(): XmlNode[] {
    return [element('g', this.attributes, [element('text', { x: '0', y: '0', 'font-size': '1000',
      transform: `matrix(${this.size / 1000} 0 0 ${this.size / 1000} ${this.x} ${this.y})`,
      'font-family': 'Bravura', 'font-weight': 'normal', 'font-style': 'normal', 'aria-hidden': 'true',
      'data-m3n-glyph': this.name }, [glyphs[this.name].character])])]
  }
}
