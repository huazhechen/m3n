import { compileScorePerformance, deriveScoreInteraction, formatM3N, parseM3NDocument, resolveScorePitches, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/xiao_ye_qu_01.m3n?raw'
import reference from './fixtures/xiao-ye-qu-kuaiyuepu-reference.json'
import categories from '../../scorebook/library-categories.json'
import plan from '../../scorebook/editorial-plan.json'

function midi(value: string) {
  const [letter, octave, accidental = ''] = value.split(':')
  return 12 * (Number(octave) + 1) + ({ c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[letter!]!)
    + ({ '': 0, n: 0, s: 1, ss: 2, f: -1, ff: -2 }[accidental]!)
}

it('matches every printed main pitch and duration in the new 快乐谱 screenshot, including F to D', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  const document = parseM3NDocument(source)
  expect([document.title, document.key, document.meterCount, document.meterUnit, document.tempo])
    .toEqual(['小夜曲', 'F', 3, 4, 75])
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length || bar.multiRest)
  const pitches = resolveScorePitches(bars)
  expect(bars).toHaveLength(reference.bars.length)
  for (const [index, expected] of reference.bars.entries()) {
    const bar = bars[index]!
    expect(bar.events[0]!.key, `bar ${index + 1}`).toBe(expected.key)
    expect(bar.events.flatMap(event => (pitches.get(event) ?? []).map(midi)), `bar ${index + 1} pitches`).toEqual(expected.pitches)
    const durations = bar.events.flatMap(event => event.kind === 'rest' ? [] : event.kind === 'tuplet'
      ? event.pitches.map(() => event.beats / event.pitches.length) : [event.beats])
    expect(durations, `bar ${index + 1} durations`).toEqual(expected.durations)
    expect(bar.events.reduce((sum, event) => sum + event.beats, 0)).toBeCloseTo(3)
  }
  expect(bars[23]!.events[0]!.tie).toBe(true)
  expect(bars[35]!.events[0]!.tie).toBe(true)
  expect(bars.flatMap(bar => bar.events.flatMap(event => event.postfixes)))
    .toEqual(['ac(4 5)', 'ac(2 3)', 'ac(6 7)', 'ac(6 7)'])
})

it('matches the performed screenshot melody through both endings and the complete coda', () => {
  const document = parseM3NDocument(source)
  const order = [
    ...Array.from({ length: 25 }, (_, index) => index + 1),
    ...Array.from({ length: 23 }, (_, index) => index + 1),
    ...Array.from({ length: 15 }, (_, index) => index + 26),
  ]
  const expected: Array<{ start: number; end: number; pitch: number }> = []
  const tiedContinuations = new Set([25, 37])
  for (const [position, number] of order.entries()) {
    const bar = reference.bars[number - 1]!
    let cursor = position * 3
    const graces = 'gracePitches' in bar ? bar.gracePitches! : []
    for (const pitch of graces) {
      expected.push({ start: cursor, end: cursor + 1 / 16, pitch })
      cursor += 1 / 16
    }
    let beat = position * 3
    for (const [index, pitch] of bar.pitches.entries()) {
      const duration = bar.durations[index]!
      if (index === 0 && tiedContinuations.has(number)) expected.at(-1)!.end = beat + duration
      else expected.push({ start: index === 0 ? cursor : beat, end: beat + duration, pitch })
      beat += duration
    }
  }
  const performance = compileScorePerformance(document)
  expect(performance.beats).toBe(189)
  expect(performance.notes).toHaveLength(expected.length)
  for (const [index, note] of performance.notes.entries()) {
    expect(note.pitch, `performed note ${index + 1}`).toBe(expected[index]!.pitch)
    expect(note.start).toBeCloseTo(expected[index]!.start)
    expect(note.end).toBeCloseTo(expected[index]!.end)
  }
  const unfolded = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(unfolded).toHaveLength(63)
  expect(unfolded.map(bar => bar.events[0]!.key)).toEqual(order.map(number => reference.bars[number - 1]!.key))
})

it('keeps only the melody, without lyrics, violin credits or bow symbols', () => {
  const document = parseM3NDocument(source)
  expect(document.lyrics).toEqual([])
  expect([...deriveScoreInteraction(document).lyricsByEvent.values()].flat()).toEqual([])
  expect(source).not.toMatch(/⊓|∨|弓法|text=|小提琴|兔耳|lyricist=|^L\d*:/m)
})

it('keeps the same final-chapter placement and updates the catalog title', () => {
  const category = categories.at(-1)!
  expect(category.id).toBe('instrumental')
  expect(category.files[2]).toBe('xiao_ye_qu_01.m3n')
  expect(plan.entries.filter(entry => entry.section === category.id).map(entry => entry.file)).toEqual(category.files)
  expect(plan.entries.find(entry => entry.file === 'xiao_ye_qu_01.m3n')!.title).toBe('小夜曲')
  expect(plan.sourceCount).toBe(plan.entries.length)
})
