import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import fontkit from '@pdf-lib/fontkit'
import glyphs from './staff-glyphs.json' with { type: 'json' }
import { staffGlyph, type StaffGlyph } from './staff-music-font.js'
import { element, readXml, SvgGeometry, xml } from './layout-svg.js'

const measure = () => ({ width: 0, left: 0, right: 0, ascent: 0, descent: 0 })
describe('distributed native staff font', () => {
  it('uses the actual distributed face for every symbol and ink bound', () => {
    const font = fontkit.create(new Uint8Array(readFileSync(new URL('../../../numbered-notation/src/font-assets/Bravura.ttf', import.meta.url))))
    for (const value of Object.values(glyphs)) {
      const glyph = font.glyphForCodePoint(value.character.codePointAt(0)!)
      expect(glyph.id).toBeGreaterThan(0)
      expect(value.left).toBeCloseTo(glyph.bbox.minX / font.unitsPerEm, 8)
      expect(value.right).toBeCloseTo(glyph.bbox.maxX / font.unitsPerEm, 8)
      expect(value.top).toBeCloseTo(-glyph.bbox.maxY / font.unitsPerEm, 8)
      expect(value.bottom).toBeCloseTo(-glyph.bbox.minY / font.unitsPerEm, 8)
    }
  })
  it('preserves independent ink through SVG serialization and transforms', () => {
    for (const name of Object.keys(glyphs) as StaffGlyph[]) {
      const root = element('g', { transform: 'translate(17.125 -8.5) scale(0.7)' }, [staffGlyph(name, 17.12345, -13.987, 40)])
      const parsed = readXml(xml(root))
      const before = new SvgGeometry(root, measure).pieces(root), after = new SvgGeometry(parsed, measure).pieces(parsed)
      expect(after).toHaveLength(before.length)
      before.forEach((box, i) => { for (const key of ['left', 'right', 'top', 'bottom'] as const) expect(box[key]).toBeCloseTo(after[i]![key], 10) })
    }
  })
  it('does not serialize text attributes while measuring candidates', () => {
    const glyph = staffGlyph('gClef', 0, 70)
    expect(glyph.children).toEqual([])
    expect(glyph.numericInk!.length).toBeGreaterThan(0)
    expect(new SvgGeometry(glyph, measure).ink(glyph).bottom).toBeGreaterThan(70)
    expect(glyph.children).toEqual([])
    expect(xml(glyph)).toContain('font-family="Bravura"')
  })
})

it('scales every native music glyph from seven to eight staff-space pixels', () => {
  const original = scoreLayoutConfig.staff.music
  try {
    for (const name of Object.keys(glyphs) as StaffGlyph[]) {
      scoreLayoutConfig.staff.music = 28
      const before = staffGlyph(name, 0, 0).numericInk!
      scoreLayoutConfig.staff.music = 32
      const after = staffGlyph(name, 0, 0).numericInk!
      expect(after).toHaveLength(before.length)
      before.forEach((box, i) => {
        for (const key of ['left', 'right', 'top', 'bottom'] as const)
          expect(after[i]![key]).toBeCloseTo(box[key] * 8 / 7, 10)
      })
    }
  } finally { scoreLayoutConfig.staff.music = original }
})
