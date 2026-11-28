import { expect, it } from 'vitest'
import { scoreEnvelopeBlock, scoreHeightEnvelope, mergeScoreHeightEnvelopes } from './height-envelope.js'
import { prepareScorePagination } from './pagination.js'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from '../native-layout.js'

it('merges asymmetric cores about their shared music centre, preserving total ink bounds', () => {
  const merged = mergeScoreHeightEnvelopes([
    { coreAbove: 20, coreBelow: 4, extraAbove: 0, extraBelow: 30, hasLyrics: false },
    { coreAbove: 5, coreBelow: 18, extraAbove: 22, extraBelow: 0, hasLyrics: true },
  ])
  expect(merged).toEqual({ coreAbove: 20, coreBelow: 18, extraAbove: 7, extraBelow: 16, hasLyrics: true })
  expect(scoreHeightEnvelope(scoreEnvelopeBlock(merged, 600, -9), -9, true)).toEqual(merged)
})

it('keeps the opening expression below the actual header after precise element placement', async () => {
  const { readFileSync } = await import('node:fs')
  const { nativeSvgPieces } = await import('../native-ink.js')
  const { nativeHeaderGap } = await import('../native-style.js')
  const document = parseM3NDocument(readFileSync(new URL('../../../../src/scores/ai_de_li_zan_01.m3n', import.meta.url), 'utf8'))
  for (const width of [528, 552, 648]) {
    const layout = layoutNativeScore(document, { width, paged: true, pageMargin: 0 })
    const system = layout.systems[0]!
    const glyph = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs))
      .find(glyph => glyph.annotationLayout?.some(item => item.text.includes('Andante')))!
    const expression = glyph.annotationLayout!.find(item => item.text.includes('Andante'))!
    const lane = system.lanes.find(lane => lane.id === glyph.lane)!
    const expressionTop = system.top + lane.y - expression.top
    const headerBottom = Math.max(...nativeSvgPieces(layout.pages[0]!.header!, layout.measurer).map(piece => piece.bottom))
    expect(expressionTop - headerBottom).toBeGreaterThanOrEqual(nativeHeaderGap() - 1e-6)
  }
})

it('lets horizontally disjoint extras cross while preserving half-core collision clearance', () => {
  const core = { top: -10, bottom: 10 }
  const upper = { height: 50, core, ink: [{ left: 0, right: 90, top: -10, bottom: 50 }] }
  const lower = { height: 10, core, ink: [{ left: 100, right: 200, top: -50, bottom: 10 }] }
  const options = { pageHeight: Infinity, margin: 0, gap: 20 }
  const disjoint = prepareScorePagination([upper, lower])(options)
  expect(disjoint.positions[1]!.top - disjoint.positions[0]!.top).toBe(40)
  const overlapping = prepareScorePagination([upper, { ...lower, ink: [{ ...lower.ink[0]!, left: 0, right: 90 }] }])(options)
  expect(overlapping.positions[1]!.top - overlapping.positions[0]!.top).toBe(110)
})
