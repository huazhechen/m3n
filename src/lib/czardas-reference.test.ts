import { compileScorePerformance, formatM3N, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/cha_er_da_shi_01.m3n?raw'
import reference from './fixtures/czardas-ricordi-reference.json'
import categories from '../../config/scorebook/library-categories.json'
import plan from '../../config/scorebook/editorial-plan.json'

const document = parseM3NDocument(source)
const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
const pitches = resolveScorePitches(bars)
const natural: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
const accidental: Record<string, number> = { '': 0, n: 0, s: 1, f: -1 }

it('matches all concert pitches, durations, rests and ties read from the Ricordi violin part', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  expect(bars).toHaveLength(130)
  for (const [index, bar] of bars.entries()) {
    const expected = reference.bars[index]!
    expect(bar.events.reduce((sum, event) => sum + event.beats, 0)).toBeCloseTo(expected.beats, 10)
    const actual = bar.events.flatMap(event => {
      const resolved = pitches.get(event) ?? []
      const midi = (pitch: string) => {
        const [name, octave, alteration] = pitch.split(':')
        return 12 * (Number(octave) + 1) + natural[name!]! + accidental[alteration!]!
      }
      if (event.kind === 'tuplet') return resolved.map(pitch =>
        [midi(pitch), event.beats / resolved.length, false] as const)
      expect(resolved.length).toBeLessThanOrEqual(1)
      return [[resolved.length ? midi(resolved[0]!) : null, event.beats, event.tie] as const]
    })
    expect(actual).toHaveLength(expected.events.length)
    actual.forEach(([pitch, beats, tie], eventIndex) => {
      const expectedEvent = expected.events[eventIndex]!
      expect(pitch, `written bar ${index + 1}, event ${eventIndex + 1}`).toBe(expectedEvent[0])
      expect(beats).toBeCloseTo(expectedEvent[1] as number, 10)
      expect(tie).toBe(expectedEvent[2])
    })
  }
})

it('keeps the original three repeats and the complete D-minor/D-major form as a single melody', () => {
  expect(compileScorePerformance(document).beats).toBeCloseTo(390, 10)
  expect(source.match(/\|\|:/g)).toHaveLength(3)
  expect(source.match(/:\|\|/g)).toHaveLength(3)
  expect(source).not.toMatch(/^(?:B|C|L\d*):/m)
  expect(source).not.toContain(':h]')
  // Harmonic melody is the sounding pitch, not the touched diamond note.
  const harmonic = reference.bars.filter(bar => bar.section.startsWith('Meno,'))
  expect(harmonic).toHaveLength(16)
  expect(harmonic[0]!.events.map(event => event[0])).toEqual([98, 93, 93])
  expect(harmonic.at(-1)!.events[0]![0]).toBe(86)
  for (const bar of [14, 15, 81, 130]) {
    expect(bars[bar - 1]!.events.some(event => event.postfixes.includes('fermata'))).toBe(true)
  }
  expect(document.subtitle).toBe('Csárdás')
  expect(source).not.toContain('延长休止')
  expect([...source.matchAll(/\{text=([^}]+)\}/g)].map(match => match[1])).toEqual([
    'Largo', 'Allegro vivo', 'Molto meno', 'Meno, quasi lento',
    'Allegro vivace', 'Allegretto', 'a tempo più presto', 'Molto più vivo',
  ])
  expect(bars.flatMap(bar => bar.events).filter(event => event.tuplet?.num === 6)).toHaveLength(0)
  for (const index of [9, 11]) {
    const tuplets = bars[index]!.events.filter(event => event.kind === 'tuplet')
    expect(tuplets).toHaveLength(2)
    expect(tuplets.map(event => [event.tuplet!.num, event.beats])).toEqual([[3, .5], [3, .5]])
  }
  expect(pitches.get(bars.at(-1)!.events[0]!)).toEqual(['d:4:'])
  const file = 'cha_er_da_shi_01.m3n'
  expect(categories.find(category => category.id === 'instrumental-large')!.files).toContain(file)
  expect(plan.entries.filter(entry => entry.file === file)).toHaveLength(1)
  expect(plan.sourceCount).toBe(plan.entries.length)
})


it('uses an explicit 8va only for the sixteen harmonic bars', () => {
  expect(source.match(/\{8va\}/g)).toHaveLength(1)
  for (const [index, bar] of bars.entries()) {
    for (const event of bar.events) expect(event.octaveShift).toBe(index >= 65 && index <= 80 ? 1 : 0)
  }
})
