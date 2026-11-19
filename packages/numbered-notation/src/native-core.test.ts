import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { nativeSystemCore, weightedNativeCore } from './native-core.js'
import { layoutNativeScore } from './native-layout.js'

describe('width-weighted system core', () => {
  const body = { left: 0, right: 100, top: -10, bottom: 5 }

  it('weights musical cells by horizontal width rather than note count', () => {
    const tall = { left: 90, right: 100, top: -30, bottom: 15 }
    const expected = { top: -12, bottom: 6 }
    expect(weightedNativeCore([
      { ...body, right: 90 },
      tall,
    ])).toEqual(expected)
    expect(weightedNativeCore([
      ...Array.from({ length: 9 }, (_, index) => ({ ...body, left: index * 10, right: (index + 1) * 10 })),
      tall,
    ])).toEqual(expected)
  })

  it('gives sparse attachments less weight and does not add overlapping heights', () => {
    const sparse = { ...body, right: 10, top: -30 }
    const dense = { ...sparse, right: 90 }
    expect(weightedNativeCore([body], [sparse])).toEqual({ top: -12, bottom: 5 })
    expect(weightedNativeCore([body], [dense])).toEqual({ top: -28, bottom: 5 })
    expect(weightedNativeCore([body], [sparse, sparse])).toEqual(weightedNativeCore([body], [sparse]))
  })

  it('ignores outside attachments and empty cells without diluting a short final row', () => {
    expect(weightedNativeCore([{ ...body, left: 100, right: 200 }], [{ ...body, top: -50 }])).toEqual({ top: -10, bottom: 5 })
    expect(weightedNativeCore([{ ...body, right: 0 }])).toBeUndefined()
  })

  const options = { width: 700, paged: false, pageMargin: 0 }
  const layout = (music: string, extra = '') => layoutNativeScore(parseM3NDocument(`{4/4}\nN: 1 2 3 4 | {br} ${music} |||${extra}`), options)
  const localCore = (music: string) => {
    const score = layout(music), system = score.systems[1]!, lane = system.lanes[0]!
    const core = nativeSystemCore(system, score.measurer)!
    return { score, system, top: core.top - lane.y, bottom: core.bottom - lane.y }
  }

  it('increases average upper extent with the width covered by slurs', () => {
    const plain = localCore('1 2 3 4')
    const sparse = localCore('{lg}1 2{/} 3 4')
    const dense = localCore('{lg}1 2 3 4{/}')
    expect(sparse.top).toBeLessThan(plain.top)
    expect(dense.top).toBeLessThan(sparse.top)
    const peak = Math.min(...[...dense.system.relationLayout!.values()].map(p => p.ink.top))
    expect(dense.top).toBeGreaterThan(peak)
  })

  it('gives repeated tuplets more breathing room than an isolated tuplet', () => {
    const sparse = localCore('([123:2]) 4 5 6')
    const dense = localCore('([123:2]) ([456:2]) ([123:2]) ([456:2])')
    expect(dense.top).toBeLessThan(sparse.top)
    const step = (score: typeof sparse.score) => score.systems[1]!.lanes[0]!.y - score.systems[0]!.lanes[0]!.y
    expect(step(dense.score)).toBeGreaterThan(step(sparse.score))
  })

  it('keeps complete lyric rows in the lower core envelope', () => {
    const score = layout('1 2 3 4', '\nL: 春风花开山间流水\nL2: _ _ _ _ 故乡明月')
    const system = score.systems[1]!, lane = system.lanes[0]!
    expect(nativeSystemCore(system, score.measurer)!.bottom).toBeCloseTo(lane.y + lane.bottom)
  })

  it('counts the visible part of a slur on both sides of a line break', () => {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: {lg}1 2 3 4 | {br} 1 2 3 4{/} |||'), options)
    const plain = layout('1 2 3 4')
    expect(score.systems).toHaveLength(2)
    for (const [index, system] of score.systems.entries()) {
      const reference = plain.systems[index]!
      expect(nativeSystemCore(system, score.measurer)!.top - system.lanes[0]!.y)
        .toBeLessThan(nativeSystemCore(reference, plain.measurer)!.top - reference.lanes[0]!.y)
    }
  })
})
