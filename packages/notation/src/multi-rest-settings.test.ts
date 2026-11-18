import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from './m3n-direct.js'
import { compileScorePerformance } from './performance.js'

const source = '{4/4}{120qpm}\nN: 1 2 3 4 | {key=G}{6/8}{60qpm}{rest=2} | 1 2 3 |||\nB: 1d^ 5d^ | {rest=2} | 1d 2d 3d |'

describe('settings at multi-measure rest onset', () => {
  it('captures the active and inherited settings without inventing source events', () => {
    const part = parseM3NDocument(source).parts.get('score')!
    for (const staff of ['melody', 'bass'] as const) {
      expect(part[staff][1]).toMatchObject({ events: [], multiRest: 2, multiRestState: { key: 'G', meterCount: 6, meterUnit: 8, tempo: 60 } })
    }
  })
  it('changes the performance clock at the start of silence and aligns both voices afterwards', () => {
    const performance = compileScorePerformance(parseM3NDocument(source))
    expect(performance.meters).toEqual([{ beat: 0, count: 4, unit: 4 }, { beat: 4, count: 6, unit: 8 }])
    expect(performance.tempos).toEqual([{ beat: 0, qpm: 120 }, { beat: 4, qpm: 60 }])
    expect(performance.beats).toBe(13)
    for (const channel of [0, 1]) {
      expect(performance.notes.filter(n => n.channel === channel && n.start >= 4).map(n => n.start)).toEqual([10, 11, 12])
    }
    expect(performance.elements).toHaveLength(12)
  })
  it('publishes settings even when the piece ends with silence, including successive meter changes', () => {
    const document = parseM3NDocument('{4/4}{120qpm}\nN: 1 2 3 4 | {6/8}{60qpm}{rest=2} | {2/4}{90qpm}{rest=3} |||')
    const performance = compileScorePerformance(document)
    expect(performance.beats).toBe(16)
    expect(performance.tempos).toEqual([{ beat: 0, qpm: 120 }, { beat: 4, qpm: 60 }, { beat: 10, qpm: 90 }])
    expect(performance.meters).toEqual([{ beat: 0, count: 4, unit: 4 }, { beat: 4, count: 6, unit: 8 }, { beat: 10, count: 2, unit: 4 }])
  })
  it('restores the rest snapshot on each repeat traversal', () => {
    const performance = compileScorePerformance(parseM3NDocument('{4/4}{120qpm}\nN: 1 2 3 4 | ||: {6/8}{60qpm}{rest=2} | {2/4}{90qpm}1 2 :||'))
    expect(performance.beats).toBe(20)
    expect(performance.tempos.map(t => [t.beat, t.qpm])).toEqual([[0, 120], [4, 60], [10, 90], [12, 60], [18, 90]])
  })
  it('keeps the previous behavior for documents without rest snapshots and rejects invalid snapshot meters', () => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 | {rest=2} |||')
    const rest = document.parts.get('score')!.melody[1]!
    delete rest.multiRestState
    expect(compileScorePerformance(document).beats).toBe(12)
    rest.multiRestState = { key: 'C', meterCount: 6, meterUnit: 0, tempo: 120 }
    expect(() => compileScorePerformance(document)).toThrow('播放拍号无效')
  })
})
