import { beforeAll, afterAll, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { registerScoreFontBundle, prepareNumberedNotationFonts, fontDesignMeasurer, SCORE_TEXT_FONT, SCORE_LATIN_FONT } from '@m3n/numbered-notation'
import { textMeasurer } from './layout-svg.js'

beforeAll(async () => {
  const root = new URL('../../../../tools/fonts/library/', import.meta.url)
  const fonts = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')).fonts
  registerScoreFontBundle(fonts.map((font: { file: string }) => ({ ...font, url: '', data: new Uint8Array(readFileSync(new URL(font.file, root))) })))
  vi.stubGlobal('FontFace', class { async load() { return this } })
  vi.stubGlobal('document', { fonts: { add() {} }, createElement() { throw new Error('Design measurement must not access Canvas') } })
  await prepareNumberedNotationFonts('口琴')
})
afterAll(() => vi.unstubAllGlobals())

it('uses shared font outlines for mixed text, kerning, bold and italic without Canvas', () => {
  const staff = textMeasurer(), design = fontDesignMeasurer()!
  expect(design).toBeDefined()
  expect(staff.designMetrics).toBe(true)
  for (const [text, family] of [['口琴ABC', SCORE_TEXT_FONT], ['AV office', SCORE_LATIN_FONT], [' ', SCORE_TEXT_FONT]]) {
    for (const size of [14.4, 24, 30]) for (const bold of [false, true]) for (const italic of [false, true]) {
      const m = design.measureText(text!, { fontFamily: family, fontSize: size, fontWeight: bold ? 700 : 500, fontStyle: italic ? 'italic' : 'normal' })
      expect(staff(text!, size, bold, italic, family)).toEqual({ width: m.advance ?? m.w, left: m.inkLeft ?? 0, right: m.inkRight ?? m.w, ascent: m.baseline, descent: m.h - m.baseline })
    }
  }
})

it('retains glyph overhangs and scales every dimension linearly with music size', () => {
  const measure = textMeasurer()
  const small = measure('AV口琴', 15, true, true), large = measure('AV口琴', 30, true, true)
  for (const key of ['width', 'left', 'right', 'ascent', 'descent'] as const) expect(large[key]).toBeCloseTo(2 * small[key], 10)
  expect(() => measure('\u{10FFFF}', 24)).toThrow('设计字体缺少字符')
})
