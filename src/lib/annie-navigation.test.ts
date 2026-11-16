import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { alternativePerformance, compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, validateM3NDiagnostics } from '@m3n/notation'
import source from '../scores/annie_01.m3n?raw'

// Baselines captured from the A/B/C/D/B/C/C arrangement before restoring local navigation.
it('preserves all performed pitches, durations, ties, articulations, dynamics and tempo', () => {
  const document = alternativePerformance(parseM3NDocument(source))
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  const events = bars.flatMap(bar => bar.events.map(event => [
    pitches.get(event) ?? [], event.beats, event.tie ?? false,
    event.postfixes, event.dynamic ?? null, event.tempo,
  ]))
  expect(events).toHaveLength(415)
  expect(createHash('sha256').update(JSON.stringify(events)).digest('hex')).toBe('8ec990e9821b7f45a6723c679d4009590ba38dd2009ebbebfcee783eb0e78094')
})

it('preserves every performed lyric and its note timing while skipping the interlude on returns', () => {
  const document = parseM3NDocument(source)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const lyrics = compileScorePerformance(document).elements
    .filter(element => element.voice === 'score:melody')
    .flatMap(element => (byId.get(element.xmlId) ?? [])
      .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
      .map(lyric => [element.start, element.end, lyric.text]))
  expect(lyrics).toHaveLength(234)
  expect(createHash('sha256').update(JSON.stringify(lyrics)).digest('hex')).toBe('50d5b692fe98d0fd101291dbdefcefe7acc815bfcb3cc4bbfe4c507688f32ed5')
})

it('uses the first ending for the interlude, the second for D.S. and the third for Fine', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document.order).toBeUndefined()
  expect(document.sections ?? []).toHaveLength(0)
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars).toHaveLength(38)
  expect(bars.flatMap((bar, index) => bar.left === 'rptstart' ? [index] : [])).toEqual([4])
  expect(bars.flatMap((bar, index) => bar.right === 'rptend' ? [index] : [])).toEqual([35])
  expect(bars.slice(27).map(bar => bar.ending)).toEqual([...Array(9).fill('1'), '2', '3'])
  expect(bars[20]!.navigation).toContain('segno')
  expect(bars[36]!.navigation).toContain('ds')
  expect(bars[37]!.navigation).toContain('fine')
  expect(compileScorePerformance(document).beats).toBe(272)
})
