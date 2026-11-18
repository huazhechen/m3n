import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { alternativePerformance, compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, validateM3NDiagnostics } from '@m3n/notation'
import source from '../scores/annie_01.m3n?raw'

// Baselines include the requested 命→运 and 痛→苦 instrumental simplifications, plus the sustained 爱 in bar 27.
it('preserves all performed pitches, durations, ties, articulations, dynamics and tempo', () => {
  const document = alternativePerformance(parseM3NDocument(source))
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  const events = bars.flatMap(bar => bar.events.map(event => [
    pitches.get(event) ?? [], event.beats, event.tie ?? false,
    event.postfixes, event.dynamic ?? null, event.tempo,
  ]))
  expect(events).toHaveLength(408)
  expect(createHash('sha256').update(JSON.stringify(events)).digest('hex')).toBe('75be399245f79d05b28605a2e871c721cf369d6427a287bab77fb366d49b9353')
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
  expect(createHash('sha256').update(JSON.stringify(lyrics)).digest('hex')).toBe('fe867455954738ed6c7ba728239cc8efe31bf165c34a0a4ec6a5b77882750f33')
})

it('uses the first ending for the interlude, a shared second/third ending for D.S. and Fine', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document.order).toBeUndefined()
  expect(document.sections ?? []).toHaveLength(0)
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars).toHaveLength(37)
  expect(bars.flatMap((bar, index) => bar.left === 'rptstart' ? [index] : [])).toEqual([4])
  expect(bars.flatMap((bar, index) => bar.right === 'rptend' ? [index] : [])).toEqual([35])
  expect(bars.slice(27).map(bar => bar.ending)).toEqual([...Array(9).fill('1'), '2,3'])
  expect(bars[20]!.navigation).toContain('segno')
  expect(bars[36]!.navigation).toContain('ds')
  expect(bars[36]!.navigation).toContain('fine')
  expect(compileScorePerformance(document).beats).toBe(272)
})
