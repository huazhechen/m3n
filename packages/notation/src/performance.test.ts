import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from './m3n-direct.js'
import { compileScorePerformance } from './performance.js'

const compile = (source: string) => compileScorePerformance(parseM3NDocument(source))
const pitches = (source: string) => compile(source).notes.map(note => note.pitch)

describe('native performance compiler', () => {
  it('compiles absolute pitches with measure accidentals, key changes and octave shifts', () => {
    expect(pitches('{key=G}{4/4}\nN: 7 4# 4 4= | 4 {key=F}1 {8va}[135:h]{/} 0 |||')).toEqual([78, 73, 73, 72, 72, 65, 77, 81, 84])
  })
  it('gives melody and bass independent clocks and MIDI channels', () => {
    const result = compile('{2/4}\nN: 1 2 | 3 4 |||\nB: 1d^ | 5d^ |||')
    expect(result.notes.filter(note => note.channel === 0).map(note => note.start)).toEqual([0, 1, 2, 3])
    expect(result.notes.filter(note => note.channel === 1).map(note => [note.pitch, note.start, note.end])).toEqual([[48, 0, 2], [55, 2, 4]])
    expect(result.beats).toBe(4)
  })
  it('preserves long and dotted durations from the semantic document', () => {
    const result = compile('{4/4}\nN: 1^^^ | 2.. ((3)) 0^ |||')
    expect(result.notes.map(note => [note.start, note.end])).toEqual([[0, 8], [8, 9.75], [9.75, 10]])
    expect(result.beats).toBe(12)
  })
  it('merges a complete tied chain while preserving every source event', () => {
    const result = compile('{4/4}\nN: 1~ 1~ 1~ 1 |||')
    expect(result.notes.map(note => [note.start, note.end, note.pitch])).toEqual([[0, 4, 60]])
    expect(result.elements.map(element => [element.xmlId, element.start])).toEqual([['m3n-e-1', 0], ['m3n-e-2', 1], ['m3n-e-3', 2], ['m3n-e-4', 3]])
  })
  it('ties chords by absolute pitch and tuplets through their endpoint notes', () => {
    expect(compile('{4/4}\nN: [135:h]^~ [135:h]^ |||').notes.map(note => [note.pitch, note.end])).toEqual([[60, 4], [64, 4], [67, 4]])
    const notes = compile('{4/4}\nN: 1~ [123~:2] 3 |||').notes
    expect(notes.map(note => note.pitch)).toEqual([60, 62, 64])
    for (const [index, expected] of [[0, 5 / 3], [5 / 3, 7 / 3], [7 / 3, 4]].entries()) {
      expect(notes[index]!.start).toBeCloseTo(expected[0]!)
      expect(notes[index]!.end).toBeCloseTo(expected[1]!)
    }
  })
  it('keeps a tied continuation sounding through its on-beat grace', () => {
    const result = compile('{2/4}\nN: 6e~ 6e{ac(5e)} |||')
    expect(result.notes.map(note => [note.pitch, note.start, note.end])).toEqual([[81, 0, 2], [79, 1, 1.0625]])
  })
  it('does not tie across a navigation jump to an unrelated equal pitch', () => {
    const result = compile('{2/4}\nN: 1 2 | {segno}3 4 | 4^~ {ds} |||')
    expect(result.notes.filter(note => note.pitch === 65).map(note => note.start)).toEqual([3, 4, 7, 8])
  })
  it('expands tuplets including rests with exact domain durations', () => {
    const result = compile('{2/4}\nN: [102:2] |||')
    expect(result.beats).toBe(2)
    expect(result.notes.map(note => [note.pitch, note.start, note.end])).toEqual([[60, 0, 2 / 3], [62, 4 / 3, 2]])
  })
  it('restores the written tempo and meter when revisiting a section', () => {
    const result = compile('{3/4}{120qpm}{order=A,B,A}\n===A\nN: 1 2 3 ||\n===B\nN: {2/4}{60qpm}4 5 |||')
    expect(result.tempos).toEqual([{ beat: 0, qpm: 120 }, { beat: 3, qpm: 60 }, { beat: 5, qpm: 120 }])
    expect(result.meters).toEqual([{ beat: 0, count: 3, unit: 4 }, { beat: 3, count: 2, unit: 4 }, { beat: 5, count: 3, unit: 4 }])
    expect(result.elements.filter(element => element.xmlId === 'm3n-e-1').map(element => element.rendition)).toEqual([1, 2])
  })
  it('preserves silence before and after audible notes', () => {
    const result = compile('{3/4}\nN: {rest=2} | 1 0^ | {rest=3} |||')
    expect(result.notes.map(note => note.start)).toEqual([6])
    expect(result.beats).toBe(18)
  })
  it('steals bounded on-beat durations for grace groups and spreads arpeggios', () => {
    const result = compile('{4/4}\nN: 1{ac(7d)} 2{ap(3)} [135:h]{arp} 0 |||')
    expect(result.notes.map(note => [note.pitch, note.start])).toEqual([[59, 0], [60, 0.0625], [64, 1], [62, 1.5], [60, 2], [64, 2.0625], [67, 2.125]])
    expect(result.notes.every(note => note.end > note.start)).toBe(true)
  })
  it('does not read or mutate source text and is deterministic', () => {
    const document = parseM3NDocument('{2/4}\nN: ||: 1 2 :||')
    const original = structuredClone(document)
    Object.defineProperty(document, 'source', { get() { throw new Error('source must not be scanned') } })
    // unfoldScorePerformance spreads metadata; it must not access source either.
    expect(() => compileScorePerformance(document)).not.toThrow()
    expect(compileScorePerformance(original)).toEqual(compileScorePerformance(original))
  })
})
