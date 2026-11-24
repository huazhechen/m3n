import { parseM3NDocument, resolveScorePitches, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/guang_yin_de_gu_shi_01.m3n?raw'
import reference from './fixtures/guang-yin-kuaiyuepu.json'

it('plays the 6/8 reference with requested instrumental simplifications three times at 95 qpm', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect([document.key, document.meterCount, document.meterUnit, document.tempo]).toEqual(['G', 6, 8, 95])
  const bars = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars).toHaveLength(72)
  expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0))).toEqual(Array(72).fill(3))
  const pitches = resolveScorePitches(bars)
  const degrees: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
  const events: (number | null)[][] = []
  let beat = 0
  let continuation = false
  for (const event of bars.flatMap(bar => bar.events)) {
    const pitch = pitches.get(event)?.[0]
    const [name, octave, accidental] = pitch?.split(':') ?? []
    const midi = pitch ? 12 * (Number(octave) + 1) + degrees[name!]! + (accidental === 's' ? 1 : accidental === 'f' ? -1 : 0) : null
    if (continuation) events.at(-1)![2] = events.at(-1)![2]! + event.beats
    else events.push([beat, midi, event.beats])
    continuation = event.tie ?? false
    beat += event.beats
  }
  // Keep the original vocal reference; simplify only the requested passing notes.
  const removedOnsets = new Set([2, 8.75, 26, 32.75, 50, 53, 62, 65])
  const extendedDurations = new Map([[1.5, 1], [25.5, 1], [8.5, 0.5], [32.5, 0.5], [49.5, 1], [52.5, 1], [61.5, 1], [64.5, 1]])
  const instrumental = reference.events.filter(([onset]) => !removedOnsets.has(onset!))
    .map(([onset, pitch, duration]) => [onset!, (onset === 1.5 || onset === 25.5) ? 76 : pitch, extendedDurations.get(onset!) ?? duration])
  const expected = [0, 72, 144].flatMap(offset => instrumental.map(([onset, pitch, duration]) => [onset! + offset, pitch, duration]))
  expect(events).toEqual(expected)
})
