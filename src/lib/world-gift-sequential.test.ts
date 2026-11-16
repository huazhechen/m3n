import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { alternativePerformance, compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, validateM3NDiagnostics } from '@m3n/notation'

const original = readFileSync(new URL('./fixtures/world-gift-original.m3n', import.meta.url), 'utf8')
const source = readFileSync(new URL('../scores/shi_jie_zeng_yu_wo_de_01.m3n', import.meta.url), 'utf8')
const before = parseM3NDocument(original), after = parseM3NDocument(source)
const performedBars = (document: typeof before) => {
  const bars = alternativePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
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
const lyrics = (document: typeof before) => {
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  return compileScorePerformance(document).elements.filter(element => element.voice === 'score:melody')
    .flatMap(element => (byId.get(element.xmlId) ?? [])
      .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
      .map(lyric => [element.start, element.end, lyric.text]))
}

describe('World Gift sequential score', () => {
  it('uses a single lyric row without repeats, endings, sections or alternate melodies', () => {
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(source).not.toMatch(/---V|:\|\||\|\|:|^===|^L\d+:|^Ns?\[/m)
    expect(after.order).toBeUndefined()
    expect(after.alternatives ?? []).toHaveLength(0)
  })

  it('preserves every performed bar, pitch, duration, tie, articulation and setting', () => {
    const bars = performedBars(after)
    expect(bars).toHaveLength(47)
    expect(bars.every(bar => bar.beats === 4 && bar.meter[0] === 4 && bar.meter[1] === 4)).toBe(true)
    expect(bars).toEqual(performedBars(before))
    expect(compileScorePerformance(after).beats).toBe(188)
  })

  it('preserves the complete lyrics and every syllable’s performed timing', () => {
    const expected = lyrics(before)
    expect(expected.length).toBeGreaterThan(0)
    expect(lyrics(after)).toEqual(expected)
  })
})
