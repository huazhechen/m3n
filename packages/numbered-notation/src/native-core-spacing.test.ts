import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeHeaderGeometry } from './native-header.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativeAttachmentGap, nativeStyle } from './native-style.js'

it.each([24, 32])('derives header gaps from N while attachments follow music size %s', size => {
  const previous = nativeStyle.music
  const document = parseM3NDocument('{title=标题}{subtitle=副标题}{4/4}\nN: 1{tip} 2 3 4 |||')
  const measurer = new DefaultTextMeasurer()
  try {
    nativeStyle.music = size
    const compact = nativeHeaderGeometry(document,800,32,measurer,size*.75*2/3)
    const spacious = nativeHeaderGeometry(document,800,32,measurer,size*1.5*2/3)
    expect(compact.subtitleTop-compact.titleBottom).toBeCloseTo(size*.75/3)
    expect(spacious.subtitleTop-spacious.titleBottom).toBeCloseTo(size*1.5/3)
    expect(spacious.sidesTop-spacious.titleBottom).toBeCloseTo(size*1.5*2/3)
    expect(nativeAttachmentGap()).toBeCloseTo(size/12)
  } finally { nativeStyle.music = previous }
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
