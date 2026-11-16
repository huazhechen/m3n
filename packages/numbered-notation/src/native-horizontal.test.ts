import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import type { TextMeasurer } from './native-measure.js'

// Stable reference music metrics, captured from the shipped Barlow font.
// Ordinary prose is irrelevant to these examples' horizontal music positions.
const measurer: TextMeasurer = { measureText(text, style) { return { w: style.fontSize === 22 && text === '0' ? 11.154037475585938 : text.length * style.fontSize * 0.58, h: style.fontSize, baseline: style.fontSize * 0.8 } } }
const layout = (source: string) => layoutNativeScore(parseM3NDocument(source), { width: 800, paged: false, textMeasurer: measurer })

describe('native spacing compatibility with the frozen jpFun baseline', () => {
  it('matches all four note centres and the flush final bar of an unadorned system', () => {
    const result = layout('{4/4}\nN: 1 2 3 4 |||')
    const expected = [37.57701873779297, 217.293893737793, 397.01076873779297, 576.727643737793]
    result.projection.glyphs.forEach((glyph, index) => expect(glyph.x).toBeCloseTo(expected[index]!, 6))
    expect(result.projection.measures[0]!.barX).toBeCloseTo(763.17375, 6)
    expect(result.projection.glyphs[0]!.y).toBeCloseTo(116.31, 6)
  })
  it('reserves dots for dotted values and gives a plain eighth no phantom dot space', () => {
    const result = layout('{4/4}\nN: (1 2) 3. (4) 5 |||')
    const [eighth, , dotted] = result.projection.glyphs
    expect(eighth!.right).toBeCloseTo(5.577018737793, 6)
    expect(dotted!.right).toBeCloseTo(11.517018737793, 6)
  })
  it('reserves accidentals on the left of the number without widening its right edge', () => {
    const result = layout('{4/4}\nN: 1# 2 3 4 |||')
    const first = result.projection.glyphs[0]!
    expect(first.left).toBeCloseTo(13.08341873779297, 6)
    expect(first.right).toBeCloseTo(5.577018737793, 6)
  })
  it('fits stacked chord tones by their actual octave-dot envelopes', () => {
    const result = layout('{4/4}\nN: 1 2 3 4 |||\nB: [1d3d5d:h]^^ |||')
    const bass = result.projection.glyphs.find(glyph => glyph.staff === 'bass')!
    bass.pitchOffsets!.forEach((offset, index) => expect(offset).toBeCloseTo([0, -26.18, -52.36][index]!, 6))
    const lanes = result.systems[0]!.lanes
    expect(lanes[1]!.y - lanes[0]!.y).toBeCloseTo(97.735, 6)
  })
})
