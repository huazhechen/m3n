import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { alternativePerformance, compileScorePerformance, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'

const original = readFileSync(new URL('./fixtures/qing-niao-original.m3n', import.meta.url), 'utf8')
const source = readFileSync(new URL('../scores/qing_niao_01.m3n', import.meta.url), 'utf8')
const before = parseM3NDocument(original), after = parseM3NDocument(source)
const written = (document: typeof before) => document.parts.get('score')!.melody.filter(bar => bar.events.length)
const oldBars = written(before)
const snapshot = (bars: typeof oldBars) => {
  const pitches = resolveScorePitches(bars)
  return bars.map(bar => ({
    beats: bar.events.reduce((sum, event) => sum + event.beats, 0),
    meter: [bar.events[0]!.meterCount, bar.events[0]!.meterUnit],
    events: bar.events.map(event => ({
      pitches: pitches.get(event) ?? [], beats: event.beats, tie: event.tie ?? false,
      postfixes: event.postfixes, dynamic: event.dynamic ?? null, tempo: event.tempo,
    })),
  }))
}
const ranges = { A: [0, 9], B: [9, 26], C: [26, 38], D: [38, 46], E: [46, 60] } as const
const order = ['A', 'B', 'C', 'D', 'B', 'C', 'E', 'C', 'D'] as const

describe('Blue Bird with five named sections', () => {
  it('uses only the approved section order and has valid complete bars', () => {
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(after.order).toEqual(order)
    expect(source).not.toMatch(/---V|:\|\||\|\|:|\{(?:segno|ds|dc|fine)\}/)
    expect(after.alternatives ?? []).toHaveLength(0)
    const bars = written(after)
    expect(bars).toHaveLength(60)
    expect(snapshot(bars)).toEqual(snapshot(oldBars))
    for (const [name, [start, end]] of Object.entries(ranges)) {
      const selected = bars.filter(bar => bar.sectionName === name)
      expect(snapshot(selected), name).toEqual(snapshot(oldBars.slice(start, end)))
      expect(selected.every(bar => bar.events.reduce((sum, event) => sum + event.beats, 0) === 4)).toBe(true)
    }
  })

  it('preserves every visited section’s bar count, beats, meter and complete event sequence', () => {
    // Independent source-bar itinerary: the old D.S. expansion dropped bars 39–46
    // on the last return, despite the explicit first/third ending and Fine.
    const expected = order.flatMap(name => {
      const [start, end] = ranges[name]
      return snapshot(oldBars.slice(start, end))
    })
    const actual = alternativePerformance(after).parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(order.map(name => ranges[name][1] - ranges[name][0])).toEqual([9, 17, 12, 8, 17, 12, 14, 12, 8])
    expect(actual).toHaveLength(109)
    expect(snapshot(actual)).toEqual(expected)
    expect(compileScorePerformance(after).beats).toBe(436)
    expect(snapshot(actual.slice(-8))).toEqual(snapshot(oldBars.slice(38, 46)))
  })
})
