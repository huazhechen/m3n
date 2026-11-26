import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/an_xiang_01.m3n?raw'

import reference from './fixtures/an-xiang-pdf-reference.json'

// PDF pitches retain their printed C/A keys; compare concert MIDI pitches so
// transcribing the A section in C cannot conceal an octave or accidental error.
const semitones = [0, 2, 4, 5, 7, 9, 11]
const expectedInstrumental = reference.bars.map(bar => bar.notes.split(' ').map(token => {
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

it('matches PDF bars 2–5 and 37–47 in concert pitch, rhythm and ties, including the key change and tuplets', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect([document.key, document.meterCount, document.meterUnit, document.tempo]).toEqual(['C', 4, 4, 70])
  expect(bars).toHaveLength(52)
  expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0))).toEqual(Array(52).fill(4))
  const resolved = resolveScorePitches(bars)
  const actual = [...bars.slice(0, 4), ...bars.slice(36, 47)].map(bar => bar.events.flatMap<{ midi: number | null; beats: number; tie: boolean }>(event => {
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
    expect(actual[barIndex], `PDF bar ${reference.bars[barIndex]!.number}`).toHaveLength(expected.length)
    for (const [index, note] of expected.entries()) {
      expect(actual[barIndex]![index]!.midi, `PDF bar ${reference.bars[barIndex]!.number}, note ${index + 1}`).toBe(note.midi)
      expect(actual[barIndex]![index]!.beats).toBeCloseTo(note.beats)
      expect(actual[barIndex]![index]!.tie).toBe(note.tie)
    }
  }
})

it('plays the introduction once and the vocal section twice, with the interlude only in the first ending', () => {
  const played = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
  const expected = [...bars.slice(0, 47), ...bars.slice(4, 32), ...bars.slice(47)]
  expect(played.map(events)).toEqual(expected.map(events))
  expect(played).toHaveLength(80)
  expect(compileScorePerformance(document).beats).toBe(320)
  expect(bars.flatMap((bar, index) => bar.left === 'rptstart' ? [index + 1] : [])).toEqual([5])
  expect(bars.flatMap((bar, index) => bar.right === 'rptend' ? [index + 1] : [])).toEqual([47])
})

it('corrects the chorus melody, restores the distinct lyrics and places every syllable outside the instruments', () => {
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const lyrics = (index: number) => bars[index]!.events.map(event => (lyricsByEvent.get(event) ?? [])
    .filter(lyric => lyric.kind === 'text').map(lyric => lyric.text).join('')).join('')
  expect([22, 23, 30, 31].map(index => events(bars[index]!))).toEqual([
    [['6', 2], ['6', .5], ['5e', .5], ['4e', .5], ['2e', .5]],
    [['2e', .5], ['3e', .5], ['3e', 3]],
    [['6', 2], ['6', .5], ['5e', .5], ['4e', .5], ['2e', .5]],
    [['2e', .5], ['3e', .5], ['3e', 3]],
  ])
  expect([28, 29, 30, 31].map(lyrics)).toEqual(['烈火烧过青草', '痕看看又', '是一年春', '风'])
  expect([49, 50, 51].map(lyrics)).toEqual(['', '残留', ''])
  expect([...bars.slice(0, 4), ...bars.slice(36, 47)].flatMap(bar => bar.events)
    .flatMap(event => lyricsByEvent.get(event) ?? []).filter(lyric => lyric.kind === 'text')).toEqual([])
  expect(source).not.toMatch(/\{(?:ac|ap)\(/)
  expect(bars.flatMap(bar => bar.events.flatMap(event => event.postfixes))).toEqual([])
  expect(bars[48]!.events.at(-1)!.tie).toBe(true)
  expect(events(bars[50]!)).toEqual([['5', 2], ['6', 2]])
  expect(bars[50]!.events[1]!.tie).toBe(true)
  expect(events(bars[51]!)).toEqual([['6', 4]])
})
