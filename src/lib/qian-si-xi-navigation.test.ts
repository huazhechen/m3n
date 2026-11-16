import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { alternativePerformance, compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, validateM3NDiagnostics } from '@m3n/notation'
import source from '../scores/qian_si_xi_01.m3n?raw'

// Baselines captured from A/B/C/B/C/C before restoring the original repeat and D.S. route.
it('preserves all performed pitches, durations, ties, articulations, dynamics and tempo', () => {
  const document = alternativePerformance(parseM3NDocument(source))
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  const events = bars.flatMap(bar => bar.events.map(event => [
    pitches.get(event) ?? [], event.beats, event.tie ?? false,
    event.postfixes, event.dynamic ?? null, event.tempo,
  ]))
  expect(events).toHaveLength(385)
  expect(createHash('sha256').update(JSON.stringify(events)).digest('hex')).toBe('e76b2116776323de8b96b41f28b2f979cf71f86fe31044d6e8f5da022e63141d')
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
  expect(lyrics).toHaveLength(310)
  expect(createHash('sha256').update(JSON.stringify(lyrics)).digest('hex')).toBe('0f4096fc82cdd429b131dd6b3cf9ed2aafaffb1aec160f3c7bed30e775526522')
})

it('restores the original repeat and D.S. without named sections or partial bars', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document.order).toBeUndefined()
  expect(document.sections ?? []).toHaveLength(0)
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars).toHaveLength(36)
  expect(bars.every(bar => bar.events.reduce((sum, event) => sum + event.beats, 0) === 4)).toBe(true)
  expect(bars.flatMap((bar, index) => bar.left === 'rptstart' ? [index] : [])).toEqual([8])
  expect(bars.flatMap((bar, index) => bar.right === 'rptend' ? [index] : [])).toEqual([31])
  expect(bars.filter(bar => bar.ending).map(bar => bar.ending)).toEqual(['1', '1', '2', '2', '3', '3'])
  expect(bars[24]!.navigation).toContain('segno')
  expect(bars[33]!.navigation).toContain('ds')
  expect(document.alternatives!.map(alternative => alternative.passes)).toEqual([[2]])
  expect(compileScorePerformance(document).beats).toBe(256)
})
