import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeHeaderGeometry } from './native-header.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativeCoreGap, nativeStyle } from './native-style.js'
import { nativeLyricPieces } from './native-lyrics.js'

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
      expect(result.score.pages[0]!.coreGap).toBeCloseTo(result.gap)
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

it('scopes leading to each score and scales lyric tiers without changing global settings', () => {
  const source = '{title=标题}{subtitle=副标题}{4/4}\nN: 1{tip} 2 3 4 |||\nL1: 春天来了\nL2: 桃花开了'
  const normalDocument = parseM3NDocument(source)
  const compactDocument = parseM3NDocument('{leading=0.8}' + source)
  const options = { width: 800, paged: false, minimumNoteGap: 9 }
  const normal = layoutNativeScore(normalDocument, options)
  const compact = layoutNativeScore(compactDocument, options)
  for (const [score, gap] of [[normal, 28.8], [compact, 23.04]] as const) {
    expect(score.pages[0]!.coreGap).toBeCloseTo(gap)
    expect(score.systems[0]!.coreGap).toBeCloseTo(gap)
    const header = nativeHeaderGeometry(score.document, 800, 32, score.measurer)
    expect(header.subtitleTop - header.titleBottom).toBeCloseTo(gap * .3)
    const note = score.projection.glyphs[0]!, mark = note.markLayout![0]!
    expect(-mark.top - mark.height - 19.2).toBeCloseTo(gap * .1)
    const rows = [...note.lyrics].map(([row, data]) => {
      const pieces = nativeLyricPieces(data, note.x, note.lyricBaselines!.get(row)!, score.measurer)
      return { top: Math.min(...pieces.map(piece => piece.top)), bottom: Math.max(...pieces.map(piece => piece.bottom)) }
    })
    expect(rows).toHaveLength(2)
    expect(rows[1]!.top - rows[0]!.bottom).toBeCloseTo(gap * .1)
  }
  expect(compact.projection.glyphs.map(note => note.x)).toEqual(normal.projection.glyphs.map(note => note.x))
  expect(nativeStyle.coreGapEm).toBe(1.2)
  expect(layoutNativeScore(normalDocument, options).pages).toEqual(normal.pages)
})
