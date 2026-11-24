import { parseM3NDocument, resolveScorePitches, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import source from '../scores/flower_dance_01.m3n?raw'

it('reuses Flower Dance through D.S. and Coda without named sections', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document.order).toBeUndefined()
  expect(source).not.toMatch(/^===|\{order=/m)
  for (const mark of ['segno', 'ds', 'tocoda', 'coda']) expect(source).toContain(`{${mark}}`)
  expect(document.parts.get('score')!.melody.filter(bar => bar.events.length)).toHaveLength(75)
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars.filter(bar => bar.left === 'rptstart')).toHaveLength(1)
  expect(bars.filter(bar => bar.ending?.length)).toHaveLength(0)
})

it('preserves every expanded pitch, duration, tie, articulation, dynamic and tempo from the previous arrangement', () => {
  const document = unfoldScorePerformance(parseM3NDocument(source))
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
