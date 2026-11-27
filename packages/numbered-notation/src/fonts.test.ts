import { afterEach, expect, it, vi } from 'vitest'
import { SCORE_LATIN_FONT, SCORE_NUMBER_FONT } from './font-family.js'
import { prepareNumberedNotationFonts, registerScoreFontBundle } from './fonts.js'
import { CJK_FONTS } from './font-resources.js'
import { numberFontCss } from './number-font-css.js'
import { readFileSync } from 'node:fs'
vi.mock('./font-design.js', () => ({ prepareFontDesigns: vi.fn() }))

afterEach(() => vi.unstubAllGlobals())

it('shares the original Medium face between score numbers and Latin text', async () => {
  const root = new URL('../../../tools/fonts/library/', import.meta.url)
  const resources = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')).fonts
  registerScoreFontBundle(resources.map((font: { file: string; characters: string }) => ({ ...font, url: '', data: new Uint8Array(readFileSync(new URL(font.file, root))) })))
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

it('includes generated header labels in every score subset', () => {
  for (const font of CJK_FONTS.filter(font => font.file !== 'NotoSansSC-full.ttf')) {
    for (const char of new Set('演唱作词作曲音域：→演奏顺序：')) {
      expect(font.characters, `${font.file}: ${char}`).toContain(char)
    }
  }
})
