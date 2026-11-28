import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeHeaderGeometry } from './native-header.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativeCoreGap, nativeStyle } from './native-style.js'

it.each([24, 32])('changes vertical clearances independently of note and text sizes at %spx', size => {
  const previous = { music: nativeStyle.music, coreGapEm: nativeStyle.coreGapEm }
  const document = parseM3NDocument('{title=标题}{subtitle=副标题}{4/4}\nN: 1{tip} 2 3 4 |||')
  const measurer = new DefaultTextMeasurer()
  try {
    nativeStyle.music = size
    const render = (gapEm: number) => {
      nativeStyle.coreGapEm = gapEm
      const score = layoutNativeScore(document, { width: 800, paged: false, textMeasurer: measurer })
      const header = nativeHeaderGeometry(document, 800, 32, measurer)
      const note = score.projection.glyphs[0]!, mark = note.markLayout![0]!
      return { score, header, mark, gap: nativeCoreGap(), markClearance: -mark.top - mark.height - size * .8 }
    }
    const normal = render(1.2), spacious = render(1.6)
    expect(normal.gap).toBeCloseTo(size * 1.2)
    expect(spacious.gap).toBeCloseTo(size * 1.6)
    for (const result of [normal, spacious]) {
      expect(result.score.pages[0]!.coreGap).toBeCloseTo(size * .8)
      expect(result.markClearance).toBeCloseTo(result.gap * .1)
      expect(result.header.sidesTop - result.header.titleBottom).toBeCloseTo(result.gap * .6)
      expect(result.header.subtitleTop - result.header.titleBottom).toBeCloseTo(result.gap * .3)
    }
    expect(spacious.mark.height).toBeCloseTo(normal.mark.height)
    expect(normal.mark.height).toBeCloseTo(size * .3)
    expect(spacious.score.projection.glyphs.map(note => note.x)).toEqual(normal.score.projection.glyphs.map(note => note.x))
    expect(nativeStyle.title).toBe(32)
    expect(nativeStyle.lyric).toBe(16)
  } finally {
    Object.assign(nativeStyle, previous)
  }
})

it('changes row clearance without moving measured lyric tiers and attachments', () => {
  const document = parseM3NDocument('{4/4}\nN: 1{tip} 2 3 4 |{br} 1 2 3 4 |||\nL1: 春天来了桃花开了\nL2: 春天来了桃花开了')
  const options = { width: 800, paged: false, minimumNoteGap: 9 }
  const compact = layoutNativeScore(document, { ...options, coreGap: 19.2 })
  const spacious = layoutNativeScore(document, { ...options, coreGap: 38.4 })
  expect(compact.systems.map(row => row.measures.map(measure => measure.id))).toEqual(spacious.systems.map(row => row.measures.map(measure => measure.id)))
  expect(compact.projection.glyphs.map(glyph => [glyph.x, glyph.lyricBaselines, glyph.markLayout]))
    .toEqual(spacious.projection.glyphs.map(glyph => [glyph.x, glyph.lyricBaselines, glyph.markLayout]))
  expect(spacious.systems[1]!.top).toBeGreaterThan(compact.systems[1]!.top)
})
