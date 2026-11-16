import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { measureNativeHorizontal } from './native-horizontal.js'
import { projectNativeScore } from './native-model.js'
import type { TextMeasurer } from './native-measure.js'

// Stable reference music metrics, captured from the shipped Barlow font.
// Ordinary prose is irrelevant to these examples' horizontal music positions.
const measurer: TextMeasurer = { measureText(text, style) { return { w: style.fontSize === 22 && text === '0' ? 11.154037475585938 : text.length * style.fontSize * 0.58, h: style.fontSize, baseline: style.fontSize * 0.8 } } }
const layout = (source: string, width = 800) => layoutNativeScore(parseM3NDocument(source), { width, paged: false, textMeasurer: measurer })

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
  it('keeps a beamed eighth rest in the shared spacing group in 虫儿飞', () => {
    const result = layout(readFileSync(new URL('../../../src/scores/chong_er_fei_01.m3n', import.meta.url), 'utf8'))
    const rest = result.projection.glyphs.find(glyph => glyph.id === 'm3n-e-44')!
    const next = result.projection.glyphs.find(glyph => glyph.id === 'm3n-e-45')!
    expect(rest.x).toBeCloseTo(727.56542, 1)
    expect(next.x).toBeCloseTo(744.89338, 1)
  })

  it('uses the cross-system tie height without adding 1.1px to each successive row', () => {
    const result = layout(readFileSync(new URL('../../../src/scores/chong_er_fei_01.m3n', import.meta.url), 'utf8'), 600)
    const axes = result.systems.map(system => system.lanes[0]!.y)
    expect(axes).toHaveLength(4)
    for (const [index, gap] of [60.40926, 58.64932, 51.49935].entries()) expect(axes[index + 1]! - axes[index]!).toBeCloseTo(gap, 1)
    expect(result.pages[0]!.height).toBeCloseTo(363.02, 1)
  })

  it('counts the shared voice connector once when breaking 欢乐颂 at 600px', () => {
    const result = layout(readFileSync(new URL('../../../src/scores/huan_le_song_01.m3n', import.meta.url), 'utf8'), 600)
    expect(result.systems.map(system => system.measures.length)).toEqual([4, 4, 4, 5])
  })

  it('counts the repeat opening once when measuring and wrapping 青鸟', () => {
    const result = layout(readFileSync(new URL('../../../src/scores/qing_niao_01.m3n', import.meta.url), 'utf8'))
    const boundary = result.projection.measures[8]!
    expect(boundary.naturalEnd! - boundary.naturalStart!).toBeCloseTo(104.58733462914, 5)
    expect(result.systems.slice(0, 2).map(system => system.measures.length)).toEqual([5, 5])
  })

  it('balances dense bars and keeps equally scored short rows last in narrow 卡农', () => {
    const result = layout(readFileSync(new URL('../../../src/scores/canon_01.m3n', import.meta.url), 'utf8'), 320)
    expect(result.systems).toHaveLength(54)
    expect(result.systems.slice(-5).map(system => system.measures.map(measure => measure.index + 1)))
      .toEqual([[53, 54], [55, 56], [57, 58], [59], [60, 61]])
  })

  it('lets wide lyrics share the minimum note clearance instead of accumulating it', () => {
    const textMeasurer: TextMeasurer = { measureText(text, style) {
      return { w: text === '0' ? 11.154 : [...text].length * 20, h: style.fontSize, baseline: style.fontSize * 0.8 }
    } }
    const measure = (count: number) => {
      const document = parseM3NDocument(`{4/4}\nN: ${Array(count).fill('1').join(' ')} |||\nL: ${Array(count).fill('(春风)').join(' ')}`)
      const projection = projectNativeScore(document, { textMeasurer })
      measureNativeHorizontal(projection.measures, { noteGapEm: 0.6, minimumNoteGapEm: 0.4 })
      return projection.measures[0]!
    }
    const two = measure(2), three = measure(3)
    // Each syllable needs 20px on either side, plus 1px safety. The
    // remaining elastic margin is 2.2px; the reserved 4.4px fits inside it.
    expect(three.natural - two.natural).toBeCloseTo(2 * (20 + 1 + 2.2), 5)
    expect(three.minimum - two.minimum).toBeCloseTo(2 * (20 + 1), 5)
  })

})
