import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { alternativePerformance, compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, validateM3NDiagnostics, playbackMeasureIndexes } from '@m3n/notation'
import source from '../scores/yan_hua_yi_leng_01.m3n?raw'

import reference from './fixtures/yan-hua-navigation-baseline.json'

// Captured before changing the itinerary; these baselines include bar boundaries.
it('preserves all performed pitches, durations, ties, articulations, dynamics and tempo', () => {
  const document = alternativePerformance(parseM3NDocument(source))
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  const events = bars.flatMap(bar => bar.events.map(event => [
    pitches.get(event) ?? [], event.beats, event.tie ?? false,
    event.postfixes, event.dynamic ?? null, event.tempo,
  ]))
  expect(events).toHaveLength(reference.eventCount)
  expect(createHash('sha256').update(JSON.stringify(events)).digest('hex')).toBe(reference.eventsSha256)
})

it('preserves every performed lyric and its note timing across the repeat and the final chorus return', () => {
  const document = parseM3NDocument(source)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const lyrics = compileScorePerformance(document).elements
    .filter(element => element.voice === 'score:melody')
    .flatMap(element => (byId.get(element.xmlId) ?? [])
      .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
      .map(lyric => [element.start, element.end, lyric.text]))
  expect(lyrics).toHaveLength(reference.lyricCount)
  expect(createHash('sha256').update(JSON.stringify(lyrics)).digest('hex')).toBe(reference.lyricsSha256)
})

it('uses the AB repeat, D.S. to B and an ordinary continuation into C', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document.order).toBeUndefined()
  expect(document.sections ?? []).toHaveLength(0)
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars).toHaveLength(41)
  expect(bars[0]!.left).toBe('rptstart')
  expect(bars[33]!.right).toBe('rptend')
  expect(bars[17]!.navigation).toContain('segno')
  expect(bars[34]!.navigation).toContain('ds')
  expect(bars.filter(bar => bar.ending).map(bar => bar.ending)).toEqual(['1', '2', '3'])
  expect(bars.slice(36).every(bar => !bar.ending)).toBe(true)
  expect(compileScorePerformance(document).beats).toBe(reference.beats)
})

it('preserves the bar count and every bar duration separately for every performed A, B and C', () => {
  const bars = parseM3NDocument(source).parts.get('score')!.melody.filter(bar => bar.events.length)
  const segments: Array<{ name: string; visit: number; barBeats: number[] }> = []
  const visits = new Map<string, number>()
  let previousIndex = -1
  for (const index of playbackMeasureIndexes(bars)) {
    // Test-only boundaries identify the original music without adding printed section names.
    const name = index < 17 ? 'A' : index < 36 ? 'B' : 'C'
    if (name !== segments.at(-1)?.name || index <= previousIndex) {
      const visit = (visits.get(name) ?? 0) + 1
      visits.set(name, visit)
      segments.push({ name, visit, barBeats: [] })
    }
    const bar = bars[index]!
    expect([bar.events[0]!.meterCount, bar.events[0]!.meterUnit]).toEqual([4, 4])
    segments.at(-1)!.barBeats.push(bar.events.reduce((sum, event) => sum + event.beats, 0))
    previousIndex = index
  }
  expect(segments.map(segment => [segment.name, segment.visit, segment.barBeats.length]))
    .toEqual(reference.segments.map(segment => [segment.name, segment.visit, segment.barBeats.length]))
  expect(segments).toEqual(reference.segments)
})
