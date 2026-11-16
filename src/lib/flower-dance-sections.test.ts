import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { alternativePerformance, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import source from '../scores/flower_dance_01.m3n?raw'

it('shares Flower Dance phrases and retains visit variants and local endings', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document.order).toEqual(['Intro', 'A', 'B', 'A', 'A', 'B', 'C', 'C', 'C', 'D', 'Link', 'B', 'E', 'Outro'])
  expect(document.parts.get('score')!.melody.filter(bar => bar.events.length)).toHaveLength(45)
  expect(document.alternatives).toHaveLength(7)
  expect(document.alternatives!.map(alternative => alternative.passes)).toEqual([[2], [3], [3], [3], [3], [3], [2]])
})

it('preserves every expanded pitch, duration, tie, articulation, dynamic and tempo from the previous arrangement', () => {
  const document = alternativePerformance(parseM3NDocument(source))
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  const events = bars.flatMap(bar => bar.events.map(event => [
    pitches.get(event) ?? [], event.beats, event.tie ?? false,
    event.postfixes, event.dynamic ?? null, event.tempo,
  ]))
  expect(bars).toHaveLength(105)
  expect(events).toHaveLength(1203)
  expect(bars.flatMap(bar => bar.events).reduce((sum, event) => sum + event.beats, 0)).toBe(420)
  // Captured from the complete pre-refactor score, before changing section boundaries.
  expect(createHash('sha256').update(JSON.stringify(events)).digest('hex')).toBe('9e1ea6305d9c8357ea5a0e9bc7bc47c677c5f8b3b20f50fa10efb25c33afba2a')
})
