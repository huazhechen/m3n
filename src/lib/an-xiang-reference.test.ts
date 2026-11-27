import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/an_xiang_01.m3n?raw'

import reference from './fixtures/an-xiang-pdf-reference.json'
import arranged from './fixtures/an-xiang-arranged-reference.json'

// PDF pitches retain their printed C/A keys; compare concert MIDI pitches so
// transcribing the A section in C cannot conceal an octave or accidental error.
const semitones = [0, 2, 4, 5, 7, 9, 11]
const arrangedBars = arranged.bars
const expectedInstrumental = arrangedBars.map(bar => bar.notes.split(' ').map(token => {
  const [pitch, length] = token.split('/')
  const beats = length && length in reference.durationCodes
    ? reference.durationCodes[length as keyof typeof reference.durationCodes] : Number(length ?? 1)
  if (pitch === '0') return { midi: null, beats, tie: false }
  const [, degree, accidental, octaves, tie] = /^([1-7])([#b]?)([ed]*)(~?)$/.exec(pitch!)!
  const octave = [...octaves!].reduce((sum, mark) => sum + (mark === 'e' ? 1 : -1), 0)
  const midi = (bar.key === 'A' ? 69 : 60) + semitones[Number(degree) - 1]!
    + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + octave * 12
  return { midi, beats, tie: tie === '~' }
}))
const document = parseM3NDocument(source)
const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
const events = (bar: typeof bars[number]) => bar.events.flatMap(event => event.kind === 'tuplet'
  ? event.pitches.map(pitch => [pitch, event.beats / event.pitches.length])
  : [[event.pitches[0] ?? '0', event.beats]])

it('matches the PDF and guitar Solo arrangement in concert pitch, rhythm and ties', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(source.match(/\{8va\}/g)).toHaveLength(1)
  expect([document.key, document.meterCount, document.meterUnit, document.tempo]).toEqual(['C', 4, 4, 70])
  expect(bars).toHaveLength(47)
  expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0))).toEqual(Array(47).fill(4))
  const resolved = resolveScorePitches(bars)
  const actual = bars.slice(33, 42).map(bar => bar.events.flatMap<{ midi: number | null; beats: number; tie: boolean }>(event => {
    if (event.kind === 'rest') return [{ midi: null, beats: event.beats, tie: false }]
    return resolved.get(event)!.map((pitch, index) => {
      const [letter, octave, accidental] = pitch.split(':')
      const offsets: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
      return {
        midi: 12 * (Number(octave) + 1) + offsets[letter!]! + (accidental === 's' ? 1 : accidental === 'f' ? -1 : 0),
        beats: event.kind === 'tuplet' ? event.beats / event.pitches.length : event.beats,
        tie: index === event.pitches.length - 1 ? event.tie : !!event.tupletTies?.includes(index),
      }
    })
  }))
  for (const [barIndex, expected] of expectedInstrumental.entries()) {
    expect(actual[barIndex], `PDF bar ${arrangedBars[barIndex]!.number}`).toHaveLength(expected.length)
    for (const [index, note] of expected.entries()) {
      expect(actual[barIndex]![index]!.midi, `PDF bar ${arrangedBars[barIndex]!.number}, note ${index + 1}`).toBe(note.midi)
      expect(actual[barIndex]![index]!.beats).toBeCloseTo(note.beats)
      expect(actual[barIndex]![index]!.tie).toBe(note.tie)
    }
  }
})

it('starts with vocals, plays the interlude once and jumps to Coda on the second vocal pass', () => {
  const played = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
  const expected = [...bars.slice(0, 42), ...bars.slice(0, 28), ...bars.slice(42)]
  expect(played.map(events)).toEqual(expected.map(events))
  expect(played).toHaveLength(75)
  expect(compileScorePerformance(document).beats).toBe(300)
  expect(bars.flatMap((bar, index) => bar.left === 'rptstart' ? [index + 1] : [])).toEqual([])
  expect(bars.flatMap((bar, index) => bar.right === 'rptend' ? [index + 1] : [])).toEqual([42])
  expect(bars.every(bar => !bar.ending)).toBe(true)
  expect(source.match(/\{tocoda\}/g)).toHaveLength(1)
  expect(source.match(/\{coda\}/g)).toHaveLength(1)
})

it('corrects the chorus melody, restores the distinct lyrics and places every syllable outside the instruments', () => {
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const lyrics = (index: number) => bars[index]!.events.map(event => (lyricsByEvent.get(event) ?? [])
    .filter(lyric => lyric.kind === 'text').map(lyric => lyric.text).join('')).join('')
  expect([18, 19, 26, 27].map(index => events(bars[index]!))).toEqual([
    [['6', 2], ['6', .5], ['5e', .5], ['4e', .5], ['2e', .5]],
    [['2e', .5], ['3e', .5], ['3e', 3]],
    [['6', 2], ['6', .5], ['5e', .5], ['4e', .5], ['2e', .5]],
    [['2e', .5], ['3e', .5], ['3e', 3]],
  ])
  expect([24, 25, 26, 27].map(lyrics)).toEqual(['烈火烧过青草', '痕看看又', '是一年春', '风'])
  expect([44, 45, 46].map(lyrics)).toEqual(['', '残留', ''])
  expect(bars.slice(32, 42).flatMap(bar => bar.events)
    .flatMap(event => lyricsByEvent.get(event) ?? []).filter(lyric => lyric.kind === 'text')).toEqual([])
  expect(source).not.toMatch(/\{(?:ac|ap)\(/)
  expect(bars.flatMap(bar => bar.events.flatMap(event => event.postfixes))).toEqual([])
  expect(bars[43]!.events.at(-1)!.tie).toBe(true)
  expect(events(bars[45]!)).toEqual([['5', 2], ['6', 2]])
  expect(bars[45]!.events[1]!.tie).toBe(true)
  expect(events(bars[46]!)).toEqual([['6', 4]])
})

it('holds 留 on 3 for four beats and rests for four beats before the modulation', () => {
  expect(events(bars[31]!)).toEqual([['3', 4]])
  expect(events(bars[32]!)).toEqual(Array(4).fill(['0', 1]))
  const { lyricsByEvent } = deriveScoreInteraction(document)
  expect((lyricsByEvent.get(bars[31]!.events[0]!) ?? [])
    .filter(lyric => lyric.kind === 'text').map(lyric => lyric.text)).toEqual(['留'])
  const transition = compileScorePerformance(document).notes.filter(note => note.start >= 124 && note.start < 132)
  expect(transition.map(note => [note.pitch, note.start, note.end])).toEqual([[64, 124, 128]])
})

it('plays the guitar melody without extra attacks on tied sustained notes', () => {
  let cursor = 132 // Written bar 34: first A-major Solo bar.
  let continuation = false
  const expected: Array<{ start: number; end: number; pitch: number }> = []
  for (const note of expectedInstrumental.flat()) {
    const start = cursor
    cursor += note.beats
    if (note.midi !== null) {
      if (continuation) {
        expect(expected.at(-1)!.pitch).toBe(note.midi)
        expected.at(-1)!.end = cursor
      } else expected.push({ start, end: cursor, pitch: note.midi })
    }
    continuation = note.tie
  }
  const actual = compileScorePerformance(document).notes.filter(note => note.start >= 132 && note.start < 168)
  expect(actual).toHaveLength(expected.length)
  for (const [index, note] of actual.entries()) {
    expect(note.pitch).toBe(expected[index]!.pitch)
    expect(note.start).toBeCloseTo(expected[index]!.start)
    expect(note.end).toBeCloseTo(expected[index]!.end)
  }
  // Solo bar 2 holds the full-bend F#6 target for three beats (written bar 35).
  expect(actual.filter(note => note.start >= 136 && note.start < 139).map(note => note.start)).toEqual([136])
  expect(expectedInstrumental.flat().filter(note => note.tie)).toHaveLength(2)
})

it('retains restored PDF runs, guitar bar five and the octave-raised two-bar ending', () => {
  expect(events(bars[35]!).slice(-2)).toEqual([['5', .25], ['4', .25]])
  expect(events(bars[36]!)).toHaveLength(24)
  expect(bars[36]!.events.some(event => event.kind === 'tuplet')).toBe(false)
  expect(events(bars[36]!).at(-1)).toEqual(['3d', 1])
  expect(events(bars[37]!).slice(0, 4)).toEqual([['0', .5], ['3d', .25], ['7bd', .25], ['6d', .25]])
  const tuplets = bars.slice(38, 41).flatMap(bar => bar.events.filter(event => event.kind === 'tuplet'))
  expect(tuplets.map(event => [event.pitches, event.beats])).toEqual([
    [['2', '3', '4'], 1], [['5#', '6', '7'], 1], [['7', '1e', '1#e'], 2],
    [['4d', '5d', '7d', '2', '4', '5'], 1], [['2', '4', '5', '7', '2e', '4e'], 1],
  ])
  expect(events(bars[41]!)).toEqual([['5e', 4]])
  expect(bars.slice(31, 42).map(bar => bar.events[0]!.octaveShift)).toEqual([0, 0, ...Array(9).fill(1)])
  expect(bars[42]!.events[0]!.octaveShift).toBe(0)
})

it('writes the guitar modulation at bar 34 and restores C at both vocal entrances', () => {
  expect(bars.slice(31, 42).map(bar => bar.events[0]!.key)).toEqual(['C', 'C', ...Array(9).fill('A')])
  expect(bars[0]!.events[0]!.key).toBe('C')
  expect(bars[42]!.events[0]!.key).toBe('C')
  const played = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(played[42]!.events[0]!.key).toBe('C')
  expect(played[70]!.events[0]!.key).toBe('C')
})
