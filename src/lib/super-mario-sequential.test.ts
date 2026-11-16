import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { alternativePerformance, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import source from '../scores/super_mario_01.m3n?raw'

it('writes Super Mario sequentially with five local repeats and no outer navigation', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document.order).toBeUndefined()
  expect(document.sections ?? []).toHaveLength(0)
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars).toHaveLength(25)
  expect(bars.flatMap((bar, index) => bar.left === 'rptstart' ? [index] : [])).toEqual([1, 3, 11, 13, 21])
  expect(bars.flatMap((bar, index) => bar.right === 'rptend' ? [index] : [])).toEqual([2, 6, 12, 16, 24])
  expect(bars.every(bar => !bar.ending && !bar.navigation?.length && bar.events.every(event => !event.navigation.length))).toBe(true)
  expect(document.alternatives ?? []).toHaveLength(0)
})

it('preserves every performed event from the P/A/B/C/A/D/C/D arrangement', () => {
  const document = alternativePerformance(parseM3NDocument(source))
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  const events = bars.flatMap(bar => bar.events.map(event => [
    pitches.get(event) ?? [], event.beats, event.tie ?? false,
    event.postfixes, event.dynamic ?? null, event.tempo,
  ]))
  expect(bars).toHaveLength(41)
  expect(events).toHaveLength(404)
  expect(events.reduce((beats, event) => beats + Number(event[1]), 0)).toBe(164)
  // Captured before expanding the outer itinerary; retain accidentals, tuplets and timing.
  expect(createHash('sha256').update(JSON.stringify(events)).digest('hex')).toBe('7ec905e7e3261b7aa077af5af4a2fb7de5c687a01895d1694487f9a273bea352')
})
