import { expect, it } from 'vitest'
import { alternativePerformance, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import source from '../scores/guang_yin_de_gu_shi_01.m3n?raw'
import reference from './fixtures/guang-yin-kuaiyuepu.json'

it('plays the Kuaiyuepu 6/8 vocal melody three times at the requested 95 qpm', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect([document.key, document.meterCount, document.meterUnit, document.tempo]).toEqual(['G', 6, 8, 95])
  const bars = alternativePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
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
  const expected = [0, 72, 144].flatMap(offset => reference.events.map(([onset, pitch, duration]) => [onset! + offset, pitch, duration]))
  expect(events).toEqual(expected)
})
