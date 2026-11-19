import { expect, it } from 'vitest'
import { parseM3NDocument } from './m3n-direct.js'
import { compileScorePerformance, type GlissandoStyle } from './performance.js'

const source = '{2/4}{120qpm}\nN: (2e{gliss} 1e) 1e |||\nB: 1d^ |||'
const compile = (style: GlissandoStyle) => compileScorePerformance(parseM3NDocument(source), { glissandoStyle: style })
it('uses two accurately pitched samples with separate crossfades in soft mode, leaving the bass and next attack alone', () => {
  const performance = compile('soft')
  const transitions = performance.notes.filter(note => note.transition)
  expect(transitions.map(note => [note.start, note.end, note.pitch])).toEqual([[0, expect.closeTo(.57), 74], [.5, 1, 72]])
  expect(transitions[0]!.expression).toEqual([{ beat: 0, value: 127 }, { beat: .5, value: 127 }, { beat: expect.closeTo(.57), value: 0 }])
  expect(transitions[1]!.expression).toEqual([{ beat: .5, value: 0 }, { beat: expect.closeTo(.57), value: 127 }])
  expect(transitions[0]!.channel).not.toBe(transitions[1]!.channel)
  expect(performance.notes.find(note => note.start === 1)).toEqual({ start: 1, end: 2, pitch: 72, channel: 0, velocity: 90 })
  expect(performance.notes.find(note => note.channel === 1)).toEqual({ start: 0, end: 2, pitch: 48, channel: 1, velocity: 90 })
  expect(performance.notes.every(note => !note.pitchBends)).toBe(true)
})
it('offers plain overlap without muting the target attack', () => {
  const transitions = compile('overlap').notes.filter(note => note.transition)
  expect(transitions.map(note => [note.start, note.end, note.pitch])).toEqual([[0, expect.closeTo(.57), 74], [.5, 1, 72]])
  expect(transitions.every(note => !note.expression && !note.pitchBends)).toBe(true)
})
it('confines short bends to the final 35 ms and preserves one attack for the pair', () => {
  const notes = compile('short').notes.filter(note => note.pitchBends)
  expect(notes).toHaveLength(1)
  expect(notes[0]!.pitchBends).toEqual([{ beat: 0, pitch: 74 }, { beat: .43, pitch: 74 }, { beat: .5, pitch: 72 }])
  expect(notes[0]!.end).toBe(1)
})
it.each(['soft', 'overlap', 'short'] as const)('keeps identical written clocks for %s', style => {
  expect(compile(style).elements).toEqual(compile('continuous').elements)
  expect(compile(style).beats).toBe(2)
})
it('bounds fades within very short notes and isolates simultaneous voices', () => {
  const performance = compileScorePerformance(parseM3NDocument('{2/4}\nN: (((1{gliss} 2{gliss} 3))) 0 |||\nB: (((3d{gliss} 2d{gliss} 1d))) 0 |||'), { glissandoStyle: 'soft' })
  const notes = performance.notes.filter(note => note.transition)
  expect(notes).toHaveLength(6)
  expect(notes.every(note => note.expression!.every(point => point.beat >= note.start && point.beat <= note.end))).toBe(true)
  for (const [index, note] of notes.entries()) for (const other of notes.slice(index + 1)) {
    if (Math.max(note.start, other.start) < Math.min(note.end, other.end)) expect(note.channel).not.toBe(other.channel)
  }
})

it('defaults to compensated short slides with one attack, full expression and bounded volume lift', () => {
  const performance = compileScorePerformance(parseM3NDocument(source))
  const note = performance.notes.find(note => note.pitchBends)!
  expect(note.pitchBends).toHaveLength(14)
  expect(note.pitchBends!.at(-1)).toEqual({ beat: .5, pitch: 72 })
  expect(note.expression).toBeUndefined()
  expect(note.volume).toEqual([{ beat: 0, value: 100 }, { beat: expect.closeTo(.414), value: 100 }, { beat: .43, value: 118 }, { beat: .5, value: 118 }, { beat: .516, value: 100 }])
  expect(performance.notes.filter(note => note.channel !== 1)).toHaveLength(2)
  expect(note.end).toBe(1)
})
it('hands off after bending to a prestarted, silent target sample without a new target attack', () => {
  const notes = compile('short-carry').notes.filter(note => note.transition)
  expect(notes).toHaveLength(2)
  const [first, target] = notes
  expect(first!.pitchBends!.at(-1)).toEqual({ beat: .5, pitch: 72 })
  expect(target!.start).toBeCloseTo(.4)
  expect(target!.expression!.slice(0, 2)).toEqual([{ beat: .4, value: 0 }, { beat: .5, value: 0 }])
  expect(first!.expression!.at(-1)).toEqual({ beat: expect.closeTo(.62), value: 0 })
  expect(target!.expression!.at(-1)).toEqual({ beat: expect.closeTo(.62), value: 127 })
  expect(first!.channel).not.toBe(target!.channel)
  expect(notes.every(note => note.expression!.every(point => point.beat >= note.start && point.beat <= note.end))).toBe(true)
})
it.each(['short-smooth', 'short-level', 'short-strong', 'short-carry'] as const)('preserves source timing and bounds curves for tiny notes in %s', glissandoStyle => {
  const performance = compileScorePerformance(parseM3NDocument('{2/4}\nN: (((1{gliss} 2{gliss} 3))) 0 |||'), { glissandoStyle })
  expect(performance.elements).toEqual(compileScorePerformance(parseM3NDocument('{2/4}\nN: (((1{gliss} 2{gliss} 3))) 0 |||'), { glissandoStyle: 'short' }).elements)
  for (const note of performance.notes) {
    expect(note.end).toBeGreaterThan(note.start)
    for (const point of [...note.pitchBends ?? [], ...note.expression ?? [], ...note.volume ?? []]) {
      expect(point.beat).toBeGreaterThanOrEqual(note.start)
      expect(point.beat).toBeLessThanOrEqual(note.end)
    }
  }
})

it('offers a stronger local lift while restoring the original volume on both sides', () => {
  const note = compile('short-strong').notes.find(note => note.pitchBends)!
  expect(Math.max(...note.volume!.map(point => point.value))).toBe(127)
  expect(note.volume![0]!.value).toBe(100)
  expect(note.volume!.at(-1)!.value).toBe(100)
  expect(note.volume!.at(-1)!.beat).toBeCloseTo(.516)
})
