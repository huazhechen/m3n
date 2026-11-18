import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, playbackMeasureIndexes, resolveScorePitches, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import source from '../scores/yan_hua_yi_leng_01.m3n?raw'

import reference from './fixtures/yan-hua-navigation-baseline.json'
import beforeCleanup from './fixtures/yan-hua-before-slide-cleanup.m3n?raw'

// Preserve the independent historical source and its navigation fingerprints.
const correctedReference = beforeCleanup
  .replaceAll('{lg}((3e 2e)){/}', '(3e)')
  .replace('城%', '城')
  .replace('笛%', '笛')

function performedEvents(text: string) {
  const document = unfoldScorePerformance(parseM3NDocument(text))
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  return bars.flatMap(bar => bar.events.map(event => [
    pitches.get(event) ?? [], event.beats, event.tie ?? false,
    event.postfixes, event.dynamic ?? null, event.tempo,
  ]))
}

function performedLyrics(text: string) {
  const document = parseM3NDocument(text)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  return compileScorePerformance(document).elements
    .filter(element => element.voice === 'score:melody')
    .flatMap(element => (byId.get(element.xmlId) ?? [])
      .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
      .map(lyric => [element.start, element.end, lyric.text]))
}

it('merges only 城 and 笛 into their preceding high 3 across all three chorus visits', () => {
  const original = performedEvents(beforeCleanup)
  expect(original).toHaveLength(reference.eventCount)
  expect(createHash('sha256').update(JSON.stringify(original)).digest('hex')).toBe(reference.eventsSha256)
  const actual = performedEvents(source)
  expect(actual).toEqual(performedEvents(correctedReference))
  expect(actual).toHaveLength(reference.eventCount - 6)
  expect(compileScorePerformance(parseM3NDocument(beforeCleanup)).notes.length
    - compileScorePerformance(parseM3NDocument(source)).notes.length).toBe(6)
})

it('preserves every lyric onset while extending 城 and 笛 through the removed passing notes', () => {
  const original = performedLyrics(beforeCleanup)
  expect(original).toHaveLength(reference.lyricCount)
  expect(createHash('sha256').update(JSON.stringify(original)).digest('hex')).toBe(reference.lyricsSha256)
  const actual = performedLyrics(source)
  expect(actual).toEqual(performedLyrics(correctedReference))
  expect(actual.map(([start, , text]) => [start, text]))
    .toEqual(original.map(([start, , text]) => [start, text]))
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
