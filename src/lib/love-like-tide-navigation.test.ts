import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { alternativePerformance, compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds } from '@m3n/notation'
import source from '../scores/ai_ru_chao_shui_01.m3n?raw'

// Performance baselines include the bar 17 rhythm simplification and two written 醉→不 slide cleanups.
it('preserves all performed pitches, durations, ties, articulations, dynamics and tempo', () => {
  const document = alternativePerformance(parseM3NDocument(source))
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  const events = bars.flatMap(bar => bar.events.map(event => [
    pitches.get(event) ?? [], event.beats, event.tie ?? false,
    event.postfixes, event.dynamic ?? null, event.tempo,
  ]))
  expect(events).toHaveLength(454)
  expect(createHash('sha256').update(JSON.stringify(events)).digest('hex')).toBe('59c9af2c95ce497e0e929be441e8012d340676bc10b830dc49542993335ff307')
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
  expect(createHash('sha256').update(JSON.stringify(lyrics)).digest('hex')).toBe('ac189b92ab239b282cfff89f81e30241d2ab42c875018f0d886b53e0c0161351')
})
