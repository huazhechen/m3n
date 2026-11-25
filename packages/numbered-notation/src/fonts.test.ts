import { afterEach, expect, it, vi } from 'vitest'
import { SCORE_LATIN_FONT, SCORE_NUMBER_FONT } from './font-family.js'
import { prepareNumberedNotationFonts } from './fonts.js'
import { numberFontCss } from './number-font-css.js'

afterEach(() => vi.unstubAllGlobals())

it('shares the original Medium face between score numbers and Latin text', async () => {
  const faces: { family: string; weight?: string }[] = []
  const add = vi.fn()
  vi.stubGlobal('document', { fonts: { add } })
  vi.stubGlobal('FontFace', class {
    constructor(family: string, _source: unknown, descriptors: FontFaceDescriptors) {
      faces.push({ family, weight: descriptors.weight })
    }
    async load() { return this }
  })

  await Promise.all([prepareNumberedNotationFonts('123'), prepareNumberedNotationFonts('123')])

  expect(SCORE_NUMBER_FONT).toBe(SCORE_LATIN_FONT)
  expect(SCORE_NUMBER_FONT).toBe('Barlow Semi Condensed')
  expect(faces.map(face => face.family).sort()).toEqual(['Barlow Semi Condensed', 'Bravura', 'Noto Sans SC'])
  expect(faces.find(face => face.family === SCORE_LATIN_FONT)?.weight).toBe('500')
  expect(add).toHaveBeenCalledTimes(3)
  expect(numberFontCss).toContain("font-family: 'Barlow Semi Condensed'")
  expect(numberFontCss).toContain('font-weight:500;')
})
