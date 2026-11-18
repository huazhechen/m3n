import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import source from '../scores/tong_zhuo_de_ni_01.m3n?raw'

// Baselines captured from A/A/B/A/A/B/A/B/C before grouping complete verses.
it('preserves all performed pitches, durations, ties, articulations, dynamics and tempo', () => {
  const document = unfoldScorePerformance(parseM3NDocument(source))
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  const events = bars.flatMap(bar => bar.events.map(event => [
    pitches.get(event) ?? [], event.beats, event.tie ?? false,
    event.postfixes, event.dynamic ?? null, event.tempo,
  ]))
  expect(events).toHaveLength(320)
  expect(createHash('sha256').update(JSON.stringify(events)).digest('hex')).toBe('dafae121220d8f283619daab86b73d9d4614b92edba2d991ab69ee3ceddda3f1')
})

it('preserves every performed lyric and its note timing when distributing the five verses across two-row and single-row passages', () => {
  const document = parseM3NDocument(source)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const lyrics = compileScorePerformance(document).elements
    .filter(element => element.voice === 'score:melody')
    .flatMap(element => (byId.get(element.xmlId) ?? [])
      .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
      .map(lyric => [element.start, element.end, lyric.text]))
  expect(lyrics).toHaveLength(298)
  expect(createHash('sha256').update(JSON.stringify(lyrics)).digest('hex')).toBe('8a4a20fead0fd4e71c489f4d08b37f7c6b908460a186b7fda624485f2f28dacd')
})

it('repeats the complete 24-bar verse and chorus, then writes the final verse and chorus separately', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document.order).toBeUndefined()
  expect(document.sections ?? []).toHaveLength(0)
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars).toHaveLength(48)
  expect(bars.flatMap((bar, index) => bar.left === 'rptstart' ? [index] : [])).toEqual([0, 40])
  expect(bars.flatMap((bar, index) => bar.right === 'rptend' ? [index] : [])).toEqual([23, 47])
  expect(bars.every(bar => !bar.ending && !bar.navigation?.length && bar.events.every(event => !event.navigation.length))).toBe(true)
  expect(compileScorePerformance(document).beats).toBe(240)
  expect(unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)).toHaveLength(80)
})
