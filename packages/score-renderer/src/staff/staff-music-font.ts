import { scoreLayoutConfig, scoreNavigationGlyphHeight } from '@m3n/numbered-notation/layout'
import glyphs from './staff-glyphs.json' with { type: 'json' }
import { element, type Ink, type XmlNode, type XmlRenderOptions } from './layout-svg.js'

export type StaffGlyph = keyof typeof glyphs
export const staffGlyphCharacter = (name: StaffGlyph): string => glyphs[name].character
export const staffMusicSize = () => scoreLayoutConfig.staff.music / scoreLayoutConfig.staff.engine.scale // SMuFL: one em = four staff spaces.
export const staffGlyphMetrics = (name: StaffGlyph, size = staffMusicSize()) => {
  const g = glyphs[name]
  return { left: g.left * size, right: g.right * size, top: g.top * size, bottom: g.bottom * size, advance: g.advance * size }
}
/** Outline-derived separation for staggered key-signature accidentals. */
export function staffSignatureAdvance(name: StaffGlyph, dy: number): number {
  const glyph = glyphs[name]
  const index = Math.round(dy / staffMusicSize() * 8) + 8
  if (!('signatureAdvances' in glyph) || index < 0 || index >= glyph.signatureAdvances.length)
    throw new Error(`五线谱调号缺少轮廓间距：${name}, ${dy}`)
  return glyph.signatureAdvances[index]! * staffMusicSize()
}
// Bounded to a handful of sizes per glyph: interactive custom sizes must not
// retain an unbounded global history. Cached boxes never escape this module.
const scaledGlyphInk = new Map<StaffGlyph, Map<number, readonly Ink[]>>()
export function appendStaffGlyphInk(target: Ink[], name: StaffGlyph, size: number, x: number, y: number): void {
  let sizes = scaledGlyphInk.get(name)
  if (!sizes) { sizes = new Map(); scaledGlyphInk.set(name, sizes) }
  let boxes = sizes.get(size)
  if (!boxes) {
    boxes = glyphs[name].boxes.map(([left, top, right, bottom]) => ({
      left: left! * size, right: right! * size, top: top! * size, bottom: bottom! * size,
    }))
    if (sizes.size >= 8) sizes.clear()
    sizes.set(size, boxes)
  }
  for (const box of boxes) target.push({
    left: x + box.left, right: x + box.right, top: y + box.top, bottom: y + box.bottom,
  })
}
const characters = new Map(Object.entries(glyphs).map(([name, g]) => [g.character, name as StaffGlyph]))
/** Also used when reading back SVG, with the very same distributed font. */
export function staffCharacterInk(value: string, size: number, x: number, y: number): Ink[] {
  const result: Ink[] = []
  for (const character of value) {
    const name = characters.get(character)
    if (!name) throw new Error(`五线谱音乐字体缺少字符：${character}`)
    appendStaffGlyphInk(result, name, size, x, y)
    x += glyphs[name].advance * size
  }
  return result
}
/** Candidates allocate numeric ink only. Text attributes are created at output. */
export function staffGlyph(name: StaffGlyph, x: number, y: number, size = staffMusicSize()): XmlNode {
  return new MusicCharacter(name, x, y, size)
}
class MusicCharacter implements XmlNode {
  readonly tagName = 'g'
  readonly attributes = { class: 'm3n-music-glyph' }
  readonly children: Array<XmlNode | string> = []
  readonly numericInk: Ink[]
  constructor(private readonly name: StaffGlyph, private readonly x: number, private readonly y: number, private readonly size: number) {
    this.numericInk = []
    appendStaffGlyphInk(this.numericInk, name, size, x, y)
  }
  renderNodes(options?: XmlRenderOptions): XmlNode[] {
    if (options?.resolvedMusicGlyphs) return [element('g', this.attributes, [element('g', {
      transform: `matrix(${this.size / scoreLayoutConfig.fonts.measurementSize} 0 0 ${this.size / scoreLayoutConfig.fonts.measurementSize} ${this.x} ${this.y})`,
      'font-family': scoreLayoutConfig.fonts.music, 'font-weight': String(scoreLayoutConfig.fonts.regularWeight), 'font-style': 'normal', 'aria-hidden': 'true',
      'data-m3n-glyph': this.name,
    }, [element('text', { x: '0', y: '0', 'font-size': String(scoreLayoutConfig.fonts.measurementSize),
      'font-family': scoreLayoutConfig.fonts.music, 'font-weight': String(scoreLayoutConfig.fonts.regularWeight), 'font-style': 'normal', 'text-anchor': 'start',
    }, [glyphs[this.name].character])])])]
    return [element('g', this.attributes, [element('text', { x: '0', y: '0', 'font-size': String(scoreLayoutConfig.fonts.measurementSize),
      transform: `matrix(${this.size / scoreLayoutConfig.fonts.measurementSize} 0 0 ${this.size / scoreLayoutConfig.fonts.measurementSize} ${this.x} ${this.y})`,
      'font-family': scoreLayoutConfig.fonts.music, 'font-weight': String(scoreLayoutConfig.fonts.regularWeight), 'font-style': 'normal', 'aria-hidden': 'true',
      'data-m3n-glyph': this.name }, [glyphs[this.name].character])])]
  }
}

/** Normalize navigation ink, rather than inheriting the SMuFL staff em. */
export function staffNavigationGlyph(name: 'segno' | 'coda', x: number, y: number): XmlNode {
  const g = glyphs[name]
  const size = scoreNavigationGlyphHeight() / scoreLayoutConfig.staff.engine.scale / (g.bottom - g.top)
  return staffGlyph(name, x, y, size)
}
