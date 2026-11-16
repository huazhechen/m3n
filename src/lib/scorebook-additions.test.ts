import { describe, expect, it } from 'vitest'
import { alternativePerformance, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import dream from '../scores/zhui_meng_ren_01.m3n?raw'
import stars from '../scores/xing_xing_dian_deng_01.m3n?raw'
import conan from '../scores/ru_guo_you_ni_zai_01.m3n?raw'
import references from './fixtures/kuaiyuepu-additions.json'
import starsReference from './fixtures/xing-xing-dian-deng-jitapuji.json'

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

  it('uses the exact user introduction and the new five-page reference', () => {
    expect(stars.slice(stars.indexOf('===前奏'), stars.indexOf('===A')).trim()).toBe(starsReference.userIntroduction)
    const document = parseM3NDocument(stars)
    const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(bars).toHaveLength(57)
    expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0))).toEqual(Array(57).fill(4))
    const actual = bars.slice(12).map(bar => bar.events.map(event =>
      `${event.pitches[0]}:${event.beats}${event.tie ? '~' : ''}${event.postfixes.filter(mark => mark.startsWith('ac(')).map(mark => '/' + mark.slice(3, -1)).join('')}`,
    ))
    const expected = starsReference.writtenBarsAfterIntroduction.map(row => row.split(' ').map(token => token.replace(/:\./, ':0.')))
    expect(actual).toEqual(expected)
    expect(bars.slice(0, 49).flatMap(bar => bar.events).every(event => event.key === 'E')).toBe(true)
    expect(bars.slice(49).flatMap(bar => bar.events).every(event => event.key === 'F')).toBe(true)
    expect(document.alternatives).toHaveLength(1)
    expect(document.alternatives![0]!.passes).toEqual([2])
    expect(document.alternatives![0]!.measure.events.map(event => `${event.pitches[0]}:${event.beats}`).join(' ')).toBe(starsReference.secondPassBar8.replace(/:\./g, ':0.'))
    expect(document.lyrics.map(block => block.syllables.map(syllable => syllable.text).join('').replace(/[^\u3400-\u9fff]/g, '')).filter(Boolean)).toEqual(starsReference.lyricRows)
    // Five opening bars once, the 7-bar instrumental + 24-bar vocal repeat twice,
    // a 4-bar reprise + 8-bar third verse, and two complete 8-bar F choruses.
    expect(events(stars).reduce((sum, event) => sum + event.beats, 0)).toBe(380)
    expect(stars).toContain('重复多次，渐弱结束')
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
