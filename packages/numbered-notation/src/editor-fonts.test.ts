import { afterEach, expect, it, vi } from 'vitest'
import { scoreFontFamily, scoreSvgFontFamilies, SCORE_TEXT_FONT } from './font-family.js'
import { prepareNumberedNotationFonts } from './fonts.js'
import { CanvasTextMeasurer } from './native-measure.js'

afterEach(() => vi.unstubAllGlobals())

it('prepares only Latin and music faces for arbitrary editor text', async () => {
  const families: string[] = []
  vi.stubGlobal('document', { fonts: { add: vi.fn() } })
  vi.stubGlobal('FontFace', class {
    constructor(family: string) { families.push(family) }
    async load() { return this }
  })
  await prepareNumberedNotationFonts('编辑器未收录文字𠮷', { systemCjk: true })
  expect(families.sort()).toEqual(['Barlow Semi Condensed', 'Bravura'])
})

it('uses the same system family for measured and painted text, without changing reading fonts', () => {
  const context = {
    font: '', measureText: () => ({ width: 20, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2,
      actualBoundingBoxLeft: 0, actualBoundingBoxRight: 20 }),
  } as unknown as CanvasRenderingContext2D
  new CanvasTextMeasurer(context, undefined, undefined, false, true).measureText('中文', { fontFamily: SCORE_TEXT_FONT, fontSize: 16 })
  expect(context.font).toContain('system-ui, sans-serif')
  expect(context.font).not.toContain('Noto Sans SC')
  const svg = `<svg><text font-family="${SCORE_TEXT_FONT}">Noto Sans SC</text></svg>`
  expect(scoreSvgFontFamilies(svg, true)).toContain(`font-family="${scoreFontFamily(SCORE_TEXT_FONT, true)}"`)
  expect(scoreSvgFontFamilies(svg, true)).toContain('>Noto Sans SC</text>')
  expect(scoreSvgFontFamilies(svg)).toBe(svg)
})
