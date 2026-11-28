import { beforeAll, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import fontkit from '@pdf-lib/fontkit'
import { fontDesignMeasurer, prepareFontDesigns, designTextStyle } from './font-design.js'
import { NumberedTextMeasurementCache } from './native-measure.js'
import { NativeSymbols } from './native-symbols.js'
import { scoreLayoutConfig } from './score-layout-config.js'
import { nativeSvgInk } from './native-ink.js'
import { SCORE_LATIN_FONT, SCORE_TEXT_FONT, SCORE_MUSIC_FONT, SCORE_CJK_FONT } from './font-family.js'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { fontDesignGlyphPath, fontDesignPathInk } from './font-design-path.js'
import { measureNativeControl } from './native-controls.js'
import { NativeNumberedNotationScore } from './native-score.js'

const root = new URL('../../../tools/fonts/library/', import.meta.url)
const resources = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')).fonts.map((font: { file: string; characters: string }) => ({
  ...font, url: '', data: new Uint8Array(readFileSync(new URL(font.file, root))),
}))
beforeAll(() => prepareFontDesigns(resources))

it('measures and renders Segno with real design fonts', () => {
  const measurer = fontDesignMeasurer()!
  expect(measureNativeControl('segno', '𝄋', measurer).width).toBeGreaterThan(0)
  const source = '{title=设计字体}{key=C}{4/4}\nN: {segno}1 2 3 4 |{br} 5 6 7 1e |||'
  const pages = NativeNumberedNotationScore.create(parseM3NDocument(source)).render({ width: 720, paged: true, textMeasurer: measurer })
  expect(pages.length).toBeGreaterThan(0)
})

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

// This score used to leave local hairpin rows unresolved, causing thousands
// of disjoint-prefix searches at the 600px candidate.
it('resolves local hairpin geometry before falling back to partition enumeration', () => {
  // Keep the original 19.2px regression fixture independent of source leading edits.
  const source = readFileSync(new URL('../../../src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n', import.meta.url), 'utf8')
  const document = parseM3NDocument(source.replace(/\{leading=[^}]+\}/, `{leading=${2 / 3}}`))
  // Preserve the spacing fixture that exercises local ending-bound search.
  const groupRatio = scoreLayoutConfig.numbered.groupSpacingRatio
  try {
    scoreLayoutConfig.numbered.groupSpacingRatio = .5
    const timings: Record<string, number> = {}
    const layout = layoutNativeScore(document, { width: 600, pageMargin: 0, paged: true, numericLayout: true, textMeasurer: fontDesignMeasurer()! }, timings)
    expect(layout.pages.length).toBe(3)
    expect(layout.systems.length).toBe(40)
    expect(timings.numericEndingBoundsMs).toBeGreaterThan(0)
    expect(timings.pageBoundDpSolves ?? 0).toBeLessThan(100)
  } finally {
    scoreLayoutConfig.numbered.groupSpacingRatio = groupRatio
  }
}, 30000)

it('uses the painted number and white frame as numeric row-edge geometry, including page-edge clamps', async () => {
  const { placeNativeBarLabels } = await import('./native-system-labels.js')
  const { nativeSvgPieces } = await import('./native-ink.js')
  const measurer = fontDesignMeasurer()!
  const layout = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1 2 3 4 |||'), {width:528,paged:true,textMeasurer:measurer,numericLayout:true})
  const system = layout.systems[0]!, measure = system.measures[0]!
  for (const number of [1, 12, 123, 9999]) for (const width of [128, 528, 720])
    for (const x of [-2.1234567, 3.1234567, width - .1234567, width + 5.1234567]) {
      measure.number = number; measure.barX = x
      system.decorationLayout = []
      placeNativeBarLabels(system, [], measurer, false, width)
      const label = system.decorationLayout.find(label => label.measureNumber)!
      expect(label.ink).toEqual(nativeSvgPieces(label.svg, measurer))
    }
})

it('rejects a width by the full optimistic row graph before engraving either spacing tier',()=>{
  const score=parseM3NDocument(readFileSync(new URL('../../../src/scores/feng_01.m3n',import.meta.url),'utf8'))
  const timings:Record<string,number>={}
  expect(()=>layoutNativeScore(score,{width:696,paged:true,pageMargin:0,numericLayout:true,textMeasurer:fontDesignMeasurer()},timings,.7,2))
    .toThrow('Optimistic row graph cannot reach the incumbent page ceiling')
  expect(timings.pageFeasibilityPrunes).toBe(1)
  expect(timings.completedLayoutTrials).toBeUndefined()
})

it('constructs corrected TrueType outlines without decoding and discarding every fontkit path',()=>{
  const font=fontkit.create(resources.find((font:{file:string})=>font.file.startsWith('Barlow')).data)
  const Path=font.glyphForCodePoint(48).path.constructor as new()=>ReturnType<typeof fontDesignGlyphPath>
  let discarded=0
  class Glyph {
    _getContours(){return [[{x:0,y:0,onCurve:true},{x:10,y:0,onCurve:true},{x:0,y:10,onCurve:true}]]}
    get path(){discarded++;return new Path()}
  }
  for(let index=0;index<16;index++) {
    const glyph=new Glyph() as unknown as Parameters<typeof fontDesignGlyphPath>[0]
    const path=fontDesignGlyphPath(glyph)
    expect(fontDesignGlyphPath(glyph)).toBe(path)
    expect(fontDesignPathInk(path)).toEqual({left:0,right:10,top:0,bottom:10})
  }
  expect(discarded).toBe(1)
})
