import { compileScorePerformance, formatM3N, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/g_xian_shang_de_yong_tan_diao_01.m3n?raw'
import plan from '../../config/scorebook/editorial-plan.json'
import categories from '../../config/scorebook/library-categories.json'
import reference from './fixtures/air-on-g-string-reference.json'

// G-major arrangement: Kuaiyuepu 4bFml142f, corrected against Mutopia
// BWV1068/bach-air. See docs/AIR_ON_G_STRING_AUDIT_2026-11-26.md.
it('preserves the complete Air arrangement, chromatic notes and repeat endings without breaths', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  expect(source).not.toContain('{breath}')
  expect(source).not.toMatch(/\{(?:ac|ap)\(/)
  expect(source).not.toContain('{tr}')
  const document = parseM3NDocument(source)
  expect(document.key).toBe('G')
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length > 0)
  expect(bars).toHaveLength(38)
  expect(bars.map(bar => bar.events.reduce((beats, event) => beats + event.beats, 0))).toEqual(Array(38).fill(4))
  // Neither reference part marks a slur in bar 11; its G4 tie remains.
  expect(document.intervals.filter(interval => interval.kind === 'lg' && bars[10]!.events.some(
    event => event.sourceStart >= interval.start! && event.sourceStart <= interval.endStart!,
  ))).toEqual([])
  const pitches = resolveScorePitches(bars)
  const notes = (bar: number) => bars[bar - 1]!.events.map(event => [pitches.get(event)?.[0], event.beats])
  // The later HJczl1Q9t upload omits these four bars; retain the complete phrase.
  expect([21, 22, 23, 24].map(notes)).toEqual([
    [['g:4:', 2], ['g:4:', .5], ['b:4:', .5], ['a:4:', .5], ['g:4:', .5]],
    [['e:5:', 2], ['e:5:', 1], ['d:5:', .5], ['c:5:s', .5]],
    [['a:4:', .5], ['d:5:', .5], ['d:4:', 1], ['e:4:', 1.5], ['f:4:s', .25], ['g:4:', .25]],
    [['f:4:s', 1.5], ['e:4:', .5], ['d:4:', 2]],
  ])
  expect(notes(6).slice(2, 6)).toEqual([['f:4:n', .5], ['e:4:', .5], ['a:4:', .5], ['g:4:s', .5]])
  expect(notes(17)[0]).toEqual(['d:4:s', .5])
  expect(notes(31).at(-1)).toEqual(['f:5:n', .5])
  expect(bars.slice(-4).map(bar => bar.ending)).toEqual(['1', '1', '2', '2'])
  expect(notes(35)).toEqual([
    ['g:4:', .25], ['f:4:s', .25], ['e:4:', 1], ['f:4:s', .5],
    ['g:4:', 1], ['f:4:s', .5], ['g:4:', .5],
  ])
  expect(notes(37)).toEqual(notes(35))
  expect(compileScorePerformance(document).beats).toBe(288)
  const file = 'g_xian_shang_de_yong_tan_diao_01.m3n'
  expect(plan.sourceCount).toBe(plan.entries.length)
  expect(plan.entries.filter(entry => entry.file === file)).toHaveLength(1)
  expect(categories.find(category => category.id === 'instrumental')?.files).toEqual(
    plan.entries.filter(entry => entry.section === 'instrumental').map(entry => entry.file),
  )
})

it('matches the reference melody, rhythm and tied attacks with the documented repeated-note simplification', () => {
  const document = parseM3NDocument(source)
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length > 0)
  const pitches = resolveScorePitches(bars)
  const natural: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
  const accidental: Record<string, number> = { '': 0, n: 0, s: 1, f: -1 }
  const actual: number[][] = []
  let onset = 0
  let tied = false
  // The arrangement writes the final two bars twice as repeat endings.
  for (const bar of bars.slice(0, 36)) {
    for (const event of bar.events) {
      const [name, octave, alteration] = pitches.get(event)![0]!.split(':')
      const midi = 12 * (Number(octave) + 1) + natural[name!]! + accidental[alteration!]!
      if (tied) {
        expect(actual.at(-1)![1]).toBe(midi)
        actual.at(-1)![2]! += event.beats
      } else {
        actual.push([onset, midi, event.beats])
      }
      onset += event.beats
      tied = event.tie
    }
  }
  // Grace notes are omitted; main-note pitch and duration match the reference.
  // Bar 10 combines the reference's two repeated A4 eighths into one quarter.
  const variantOnsets = new Set([38.5, 39])
  const expected = reference.notes.filter(note => !variantOnsets.has(note[0]!)).concat([
    [38.5, 69, 1],
  ]).sort((a, b) => a[0]! - b[0]!)
  expect(actual).toEqual(expected)
  expect(bars.slice(36).map(bar => bar.events.map(event => [pitches.get(event), event.beats, event.tie])))
    .toEqual(bars.slice(34, 36).map(bar => bar.events.map(event => [pitches.get(event), event.beats, event.tie])))
})
