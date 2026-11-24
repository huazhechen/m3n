import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const original = readFileSync(new URL('./fixtures/world-gift-original.m3n', import.meta.url), 'utf8')
const source = readFileSync(new URL('../scores/shi_jie_zeng_yu_wo_de_01.m3n', import.meta.url), 'utf8')
// Apply the lyric correction and seven instrumental simplifications to the historical
// arrangement; keep the original fixture intact, including its repeats and lyrics.
const correctedOriginal = original.replace('| %颂', '| 颂%')
const simplifiedOriginal = correctedOriginal
  .replaceAll('{lg}((2 1)){/}', '(2)') // 追、听: .25 + .25 → .5
  .replaceAll('{lg}(5 (3)){/}', '(5.)') // 星、翻、合: .5 + .25 → .75
  .replace('{lg}(3 (2)){/}', '(3.)') // 恩: .5 + .25 → .75
  .replace('(5 4) 4~ 4 0', '5 4~ 4 0') // 愿: .5 + .5 → 1; keep 他’s tie
  .replace(/([追星听翻恩合愿])%/g, '$1')
const before = parseM3NDocument(simplifiedOriginal), after = parseM3NDocument(source)
const performedBars = (document: typeof before) => {
  const bars = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
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
  })

  it('preserves the arrangement with only the seven authorized pitch and duration merges', () => {
    const bars = performedBars(after)
    expect(bars).toHaveLength(47)
    expect(bars.every(bar => bar.beats === 4 && bar.meter[0] === 4 && bar.meter[1] === 4)).toBe(true)
    expect(bars).toEqual(performedBars(before))
    expect(compileScorePerformance(after).beats).toBe(188)
  })

  it('preserves the lyrics with 颂 one note earlier while extending the simplified notes', () => {
    const expected = lyrics(before)
    expect(expected.length).toBeGreaterThan(0)
    expect(lyrics(after)).toEqual(expected)
    expect(lyrics(after).map(([start, , text]) => [start, text])).toEqual(
      lyrics(parseM3NDocument(correctedOriginal)).map(([start, , text]) => [start, text]),
    )
    const oldNotes = compileScorePerformance(parseM3NDocument(original)).notes
    const newNotes = compileScorePerformance(after).notes
    expect(oldNotes.length - newNotes.length).toBe(7)
  })
})
