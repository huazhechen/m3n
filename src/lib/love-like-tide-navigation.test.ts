import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { alternativePerformance, compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds } from '@m3n/notation'
import source from '../scores/ai_ru_chao_shui_01.m3n?raw'

// Baselines captured before replacing A/B/C/B/C/C with local repeats and D.S.
it('preserves all performed pitches, durations, ties, articulations, dynamics and tempo', () => {
  const document = alternativePerformance(parseM3NDocument(source))
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  const events = bars.flatMap(bar => bar.events.map(event => [
    pitches.get(event) ?? [], event.beats, event.tie ?? false,
    event.postfixes, event.dynamic ?? null, event.tempo,
  ]))
  expect(events).toHaveLength(461)
  expect(createHash('sha256').update(JSON.stringify(events)).digest('hex')).toBe('ae291e6d6a290e29e71c0c66c8bb59ebae32632d0fd7e6f0d8247be5cd89f57e')
})

it('preserves every performed lyric and its note timing, including the pickup moved into ending two', () => {
  const document = parseM3NDocument(source)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const lyrics = compileScorePerformance(document).elements
    .filter(element => element.voice === 'score:melody')
    .flatMap(element => (byId.get(element.xmlId) ?? [])
      .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
      .map(lyric => [element.start, element.end, lyric.text]))
  expect(lyrics).toHaveLength(356)
  expect(createHash('sha256').update(JSON.stringify(lyrics)).digest('hex')).toBe('4e8a623c38c1e3f886f098db32db70ff0dd81727bc2fe737aa6e6066a701d6be')
})
