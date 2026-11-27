import { beforeAll, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import fontkit from '@pdf-lib/fontkit'
import { fontDesignMeasurer, prepareFontDesigns, designTextStyle } from './font-design.js'
import { NumberedTextMeasurementCache } from './native-measure.js'
import { NativeSymbols } from './native-symbols.js'
import { nativeSvgInk } from './native-ink.js'
import { SCORE_LATIN_FONT, SCORE_TEXT_FONT, SCORE_MUSIC_FONT, SCORE_CJK_FONT } from './font-family.js'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { fontDesignGlyphPath, fontDesignPathInk } from './font-design-path.js'

const root = new URL('../../../tools/fonts/library/', import.meta.url)
const resources = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')).fonts.map((font: { file: string; characters: string }) => ({
  ...font, url: '', data: new Uint8Array(readFileSync(new URL(font.file, root))),
}))
beforeAll(() => prepareFontDesigns(resources))

it('preserves TrueType contours starting off-curve without inserting an extra segment', () => {
  const font = fontkit.create(resources.find((font: { file: string }) => font.file === 'Bravura.ttf').data)
  const path = fontDesignGlyphPath(font.glyphForCodePoint(0xe080))
  const commands = (path as typeof path & { commands: { command: string; args: number[] }[] }).commands
  expect(commands[1]).toEqual({ command: 'quadraticCurveTo', args: [450, 104, 450, 0] })
  expect(commands[10]).toEqual({ command: 'moveTo', args: [160, 7] })
  const ink = fontDesignPathInk(path, designTextStyle.italicShear)!
  expect(ink.left).toBeCloseTo(12.977794510942516, 10)
  expect(ink.right).toBeCloseTo(457.0329463637198, 10)
})

it('uses exact TTF outlines and advances without canvas, DOM or pixel ratios', () => {
  const font = fontkit.create(resources.find((font: { file: string }) => font.file.startsWith('Barlow')).data)
  const measurer = fontDesignMeasurer(new NumberedTextMeasurementCache())!
  const glyph = font.glyphForCodePoint(48), box = glyph.path.bbox, scale = 24 / font.unitsPerEm
  const style = { fontSize: 24, fontFamily: SCORE_LATIN_FONT }
  const expected = { advance: glyph.advanceWidth * scale, baseline: box.maxY * scale,
    h: (box.maxY - box.minY) * scale, inkLeft: box.minX * scale, inkRight: box.maxX * scale }
  expect(measurer.measureText('0', style)).toMatchObject(expected)
  vi.stubGlobal('devicePixelRatio', 3)
  vi.stubGlobal('document', { createElement() { throw new Error('Canvas must not be consulted') } })
  try { expect(measurer.measureText('0', style)).toMatchObject(expected) }
  finally { vi.unstubAllGlobals() }
})

it('shapes kerning and ligatures before accumulating advances and glyph bounds', () => {
  const font = fontkit.create(resources.find((font: { file: string }) => font.file.startsWith('Barlow')).data)
  const measurer = fontDesignMeasurer()!
  for (const text of ['AV', 'office', 'éà', '1 2 3']) {
    const run = font.layout(text), value = measurer.measureText(text, { fontSize: 24, fontFamily: SCORE_LATIN_FONT })
    expect(value.advance).toBeCloseTo(run.advanceWidth * 24 / font.unitsPerEm, 10)
  }
})

it('resolves mixed text through the published three fonts and rejects missing characters', () => {
  const measurer = fontDesignMeasurer()!, style = { fontSize: 16, fontFamily: SCORE_TEXT_FONT }
  const parts = ['口琴', 'ABC', '\uE522']
  const sum = parts.reduce((sum, text) => sum + measurer.measureText(text, style).advance!, 0)
  expect(measurer.measureText(parts.join(''), style).advance).toBeCloseTo(sum, 10)
  expect(measurer.measureText('\uE522', { ...style, fontFamily: SCORE_MUSIC_FONT }).h).toBeGreaterThan(0)
  expect(() => measurer.measureText('\u{10FFFF}', style)).toThrow('设计字体缺少字符')
})

it('paints bold and italic explicitly instead of requesting platform synthesis', () => {
  const measurer = fontDesignMeasurer()!, painter = new NativeSymbols(measurer)
  const bold = painter.text('口琴', 0, 0, 16, SCORE_CJK_FONT, { 'font-weight': 700 })
  expect(bold).toContain('font-synthesis="none"')
  expect(bold).toContain(`stroke-width="${16 * designTextStyle.boldStrokeEm}"`)
  const ink = nativeSvgInk(bold, measurer), metrics = measurer.measureText('口琴', { fontFamily: SCORE_CJK_FONT, fontSize: 16, fontWeight: 700 })
  expect(ink.left).toBeCloseTo(metrics.inkLeft!, 8)
  expect(ink.right).toBeCloseTo(metrics.inkRight!, 8)
  const italic = painter.text('p', 20, 30, 16, SCORE_LATIN_FONT, { 'font-style': 'italic' })
  expect(italic).toContain('font-style="normal"')
  expect(italic).toContain('transform="matrix(1 0 -')
  const font = fontkit.create(resources.find((font: { file: string }) => font.file.startsWith('Barlow')).data)
  const italicMetrics = measurer.measureText('p', { fontSize: 16, fontFamily: SCORE_LATIN_FONT, fontStyle: 'italic' })
  const sheared = fontDesignPathInk(font.glyphForCodePoint(112).path, designTextStyle.italicShear)!
  // Independent FontTools TransformPen + BoundsPen reference.
  expect(sheared.left).toBeCloseTo(28.154658755038227, 10)
  expect(sheared.right).toBeCloseTo(514.7094240616719, 10)
  expect(italicMetrics.inkLeft).toBeCloseTo(sheared.left * 16 / font.unitsPerEm, 10)
  expect(italicMetrics.inkRight).toBeCloseTo(sheared.right * 16 / font.unitsPerEm, 10)
  // FontTools BoundsPen reference: fontkit's quadratic-to-cubic bbox loses
  // precision here (-17.453125 instead of -17.454545454545453).
  expect(fontDesignPathInk(font.glyphForCodePoint(0x128).path)!.left).toBeCloseTo(-17.454545454545453, 10)
})

it('reserves a fixed raster edge guard without changing design glyph metrics', () => {
  const score = parseM3NDocument('{title=口琴}{4/4}\nN: 1 2 3 4 |||')
  const layout = layoutNativeScore(score, { width: 528, paged: true, pageMargin: 0, numericLayout: true })
  expect(layout.margin).toBe(2)
  expect(layout.measurer.designMetrics).toBe(true)
  expect(layoutNativeScore(score, { width: 528, paged: true, pageMargin: 32, numericLayout: true }).margin).toBe(32)
})
