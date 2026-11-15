import { describe, expect, it } from 'vitest'
import { alternativePerformance, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import dream from '../scores/zhui_meng_ren_01.m3n?raw'
import stars from '../scores/xing_xing_dian_deng_01.m3n?raw'
import conan from '../scores/ru_guo_you_ni_zai_01.m3n?raw'
import references from './fixtures/kuaiyuepu-additions.json'

const sources: Record<string, string> = { zhui_meng_ren: dream, xing_xing_dian_deng: stars, ru_guo_you_ni_zai: conan }
function events(source: string, expand = true) {
  const parsed = parseM3NDocument(source)
  const document = expand ? alternativePerformance(parsed) : parsed
  const bars = document.parts.get('score')!.melody
  const pitches = resolveScorePitches(bars)
  return bars.flatMap(bar => bar.events.map(event => {
    const pitch = pitches.get(event)?.[0]
    const [name, octave, accidental] = pitch?.split(':') ?? []
    const degrees: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
    const alterations: Record<string, number> = { s: 1, f: -1, ss: 2, ff: -2 }
    return {
      pitch: pitch ? 12 * (Number(octave) + 1) + degrees[name]! + (alterations[accidental!] ?? 0) : null,
      beats: event.beats, tie: event.tie ?? false,
      instrumental: document.intervals.some(interval => interval.kind === 'inst' && interval.start !== undefined && interval.end !== undefined && interval.start <= event.sourceStart && event.sourceEnd <= interval.end),
    }
  }))
}
const musical = ({ pitch, beats, tie }: ReturnType<typeof events>[number]) => ({ pitch, beats, tie })

describe('new reference scores', () => {
  it.each(references)('validates $id and keeps a melody-only score', reference => {
    const source = sources[reference.id]!
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(parseM3NDocument(source).parts.get('score')!.bass.flatMap(bar => bar.events)).toEqual([])
  })

  it('preserves every pitched note of Dream Chaser, trimming only endpoint rests', () => {
    const reference = references[0]!
    const expected = reference.playbackEventIndexes.map(index => reference.events[index]!).filter(event => event.pitch !== null)
    const actual = events(dream)
    expect(actual.filter(event => event.pitch !== null).map(musical)).toEqual(expected.map(musical))
    expect(actual.reduce((sum, event) => sum + event.beats, 0)).toBe(112)
  })

  it('preserves the Stars vocal melody while replacing the instrumental introduction', () => {
    const reference = references[1]!
    const expected = reference.playbackEventIndexes.map(index => reference.events[index]!).filter(event => !event.instrumental && event.pitch !== null)
    const actual = events(stars).filter(event => !event.instrumental && event.pitch !== null)
    expect(actual.map(musical)).toEqual(expected.map(musical))
    expect(stars).toContain('Ns[2]: 1:')
    expect(stars).toContain('{key=F}')
  })

  it('uses the image introduction with alternating low sixes, rests and low sharp five', () => {
    const intro = events(stars, false).filter(event => event.instrumental)
    expect(intro.slice(0, 11).map(musical)).toEqual([
      [61,.5], [73,.5], [61,.5], [73,.5], [66,.25], [68,.25], [73,.25], [71,.25], [71,.25], [68,.25], [73,.5],
    ].map(([pitch, beats], index) => ({ pitch, beats, tie: index === 7 })))
    const bars = parseM3NDocument(stars).parts.get('score')!.melody.filter(bar => bar.events.length).slice(0, 12)
    expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0))).toEqual(Array(12).fill(4))
    expect(bars[6]!.events.filter(event => event.kind === 'rest')).toHaveLength(2)
    expect(bars[7]!.events.some(event => stars.slice(event.sourceStart, event.sourceEnd).includes('5#d'))).toBe(true)
  })

  it('keeps all Conan pitches and ties with only the eight authorized half-beat corrections', () => {
    const reference = references[2]!
    const expected = reference.playbackEventIndexes.map(index => reference.events[index]!).filter(event => event.pitch !== null)
    const actual = events(conan)
    const pitched = actual.filter(event => event.pitch !== null)
    expect(pitched.map(({ pitch, tie }) => ({ pitch, tie }))).toEqual(expected.map(({ pitch, tie }) => ({ pitch, tie })))
    expect(pitched.flatMap((event, index) => event.beats !== expected[index]!.beats ? [[index, event.beats - expected[index]!.beats]] : [])).toEqual([163,165,169,171,175,182,190,191].map(index => [index, -.5]))
    expect(actual.reduce((sum, event) => sum + event.beats, 0)).toBe(160)
    expect(parseM3NDocument(conan).title).toBe('如果有你在')
  })
})
