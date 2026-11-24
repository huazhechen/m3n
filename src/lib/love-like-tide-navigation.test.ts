import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, unfoldScorePerformance } from '@m3n/notation'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { writtenEventSpans } from './fixtures/written-event-spans'
import source from '../scores/ai_ru_chao_shui_01.m3n?raw'

// Performance baselines include the bar 17 rhythm simplification and two written 醉→不 slide cleanups and the restored 3→2 endings in bars 21 and 30.
it('preserves all performed pitches, durations, ties, articulations, dynamics and tempo', () => {
  const document = unfoldScorePerformance(parseM3NDocument(source))
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  const events = bars.flatMap(bar => bar.events.map(event => [
    pitches.get(event) ?? [], event.beats, event.tie ?? false,
    event.postfixes, event.dynamic ?? null, event.tempo,
  ]))
  expect(events).toHaveLength(457)
  expect(createHash('sha256').update(JSON.stringify(events)).digest('hex')).toBe('04b5626936ce1fcca55a7fd60d074823e83624ea7f61698a6b3d1e23ee37ea66')
})

it('preserves every performed lyric and its note timing, including the pickup moved into ending two', () => {
  const document = parseM3NDocument(source)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const lyrics = writtenEventSpans(compileScorePerformance(document).elements)
    .filter(element => element.voice === 'score:melody')
    .flatMap(element => (byId.get(element.xmlId) ?? [])
      .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
      .map(lyric => [element.start, element.end, lyric.text]))
  expect(lyrics).toHaveLength(356)
  expect(createHash('sha256').update(JSON.stringify(lyrics)).digest('hex')).toBe('e0217427a9c36dd441e64fbf54ec02cddd14f9da2ef6c265cb9d9fedc7af8540')
})
