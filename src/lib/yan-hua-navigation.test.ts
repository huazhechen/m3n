import { compileScorePerformance, parseM3NDocument, playbackMeasureIndexes, validateM3NDiagnostics } from '@m3n/notation'

import { expect, it } from 'vitest'
import source from '../scores/yan_hua_yi_leng_01.m3n?raw'

import reference from './fixtures/yan-hua-navigation-baseline.json'
it('uses the AB repeat, D.S. to B and an ordinary continuation into C', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document.order).toBeUndefined()
  expect(document.sections ?? []).toHaveLength(0)
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars).toHaveLength(41)
  // The repeat end returns to the implicit score start; no printed start is needed.
  expect(bars[0]!.left).toBeUndefined()
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
