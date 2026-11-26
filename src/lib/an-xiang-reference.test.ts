import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/an_xiang_01.m3n?raw'

import reference from './fixtures/an-xiang-pdf-reference.json'
import refined from './fixtures/an-xiang-refined-reference.json'
import beforeSource from './fixtures/an-xiang-before-simplification.m3n?raw'

// PDF pitches retain their printed C/A keys; compare concert MIDI pitches so
// transcribing the A section in C cannot conceal an octave or accidental error.
const semitones = [0, 2, 4, 5, 7, 9, 11]
const arrangedBars = [...reference.bars.slice(0, 4), ...refined.bars]
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

it('matches the PDF introduction and uploaded refined interlude in concert pitch, rhythm and ties', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect([document.key, document.meterCount, document.meterUnit, document.tempo]).toEqual(['C', 4, 4, 70])
  expect(bars).toHaveLength(50)
  expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0))).toEqual(Array(50).fill(4))
  const resolved = resolveScorePitches(bars)
  const actual = [...bars.slice(0, 4), ...bars.slice(35, 45)].map(bar => bar.events.flatMap<{ midi: number | null; beats: number; tie: boolean }>(event => {
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

it('plays the introduction and interlude once and jumps to Coda on the second vocal pass without houses', () => {
  const played = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
  const expected = [...bars.slice(0, 45), ...bars.slice(4, 32), ...bars.slice(45)]
  expect(played.map(events)).toEqual(expected.map(events))
  expect(played).toHaveLength(78)
  expect(compileScorePerformance(document).beats).toBe(312)
  expect(bars.flatMap((bar, index) => bar.left === 'rptstart' ? [index + 1] : [])).toEqual([5])
  expect(bars.flatMap((bar, index) => bar.right === 'rptend' ? [index + 1] : [])).toEqual([45])
  expect(bars.every(bar => !bar.ending)).toBe(true)
  expect(source.match(/\{tocoda\}/g)).toHaveLength(1)
  expect(source.match(/\{coda\}/g)).toHaveLength(1)
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
  expect([47, 48, 49].map(lyrics)).toEqual(['', '残留', ''])
  expect([...bars.slice(0, 4), ...bars.slice(36, 45)].flatMap(bar => bar.events)
    .flatMap(event => lyricsByEvent.get(event) ?? []).filter(lyric => lyric.kind === 'text')).toEqual([])
  expect(source).not.toMatch(/\{(?:ac|ap)\(/)
  expect(bars.flatMap(bar => bar.events.flatMap(event => event.postfixes))).toEqual([])
  expect(bars[46]!.events.at(-1)!.tie).toBe(true)
  expect(events(bars[48]!)).toEqual([['5', 2], ['6', 2]])
  expect(bars[48]!.events[1]!.tie).toBe(true)
  expect(events(bars[49]!)).toEqual([['6', 4]])
})

it('keeps the refined quarter-note 留 and three sixteenth-note groups at bar 36', () => {
  expect(events(bars[35]!)).toEqual([
    ['3', 1], ['3', .25], ['7d', .25], ['1', .25], ['2', .25],
    ['1', .25], ['7d', .25], ['1', .25], ['2', .25],
    ['3', .25], ['7d', .25], ['1', .25], ['2', .25],
  ])
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const texts = (event: typeof bars[number]['events'][number]) => (lyricsByEvent.get(event) ?? [])
    .filter(lyric => lyric.kind === 'text').map(lyric => lyric.text)
  expect(texts(bars[35]!.events[0]!)).toEqual(['留'])
  expect(bars[35]!.events.slice(1).flatMap(texts)).toEqual([])
  const transition = compileScorePerformance(document).notes.filter(note => note.start >= 140 && note.start < 141.5)
  expect(transition.map(note => [note.pitch, note.start, note.end])).toEqual([
    [64, 140, 141], [64, 141, 141.25], [59, 141.25, 141.5],
  ])
})

it('plays the simplified melody without extra attacks on the retained sustained note', () => {
  let cursor = 140 // Written bar 36: vocal quarter followed by instrumental notes.
  let continuation = false
  const expected: Array<{ start: number; end: number; pitch: number }> = []
  for (const note of expectedInstrumental.slice(4).flat()) {
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
  const actual = compileScorePerformance(document).notes.filter(note => note.start >= 140 && note.start < 180)
  expect(actual).toHaveLength(expected.length)
  for (const [index, note] of actual.entries()) {
    expect(note.pitch).toBe(expected[index]!.pitch)
    expect(note.start).toBeCloseTo(expected[index]!.start)
    expect(note.end).toBeCloseTo(expected[index]!.end)
  }
  // Refined bar 39 holds 6 for three beats.
  expect(actual.filter(note => note.start >= 152 && note.start < 155).map(note => note.start)).toEqual([152])
  expect(expectedInstrumental.slice(4).flat().filter(note => note.tie)).toHaveLength(2)
})

it('preserves the other vocals and introduction while replacing the old interlude with the ten refined bars', () => {
  const beforeDocument = parseM3NDocument(beforeSource)
  const before = compileScorePerformance(beforeDocument), after = compileScorePerformance(document)
  const previous = before.notes.filter(note => note.start < 140 || note.start >= 188)
  const current = after.notes.filter(note => note.start < 140 || note.start >= 180)
  expect(current).toHaveLength(previous.length)
  for (const [index, note] of current.entries()) {
    const prior = previous[index]!
    const shift = prior.start >= 188 ? 8 : 0
    expect(note.pitch).toBe(prior.pitch)
    expect(note.start).toBeCloseTo(prior.start - shift)
    expect(note.end).toBeCloseTo(prior.end - shift)
  }
  expect(after.beats).toBe(before.beats - 8)
  expect(document.lyrics.map(block => block.syllables.map(syllable => syllable.text))).toEqual(
    beforeDocument.lyrics.map(block => block.syllables.map(syllable => syllable.text)),
  )
  const currentInterlude = after.notes.filter(note => note.start >= 140 && note.start < 180)
  const previousInterlude = before.notes.filter(note => note.start >= 144 && note.start < 188)
  expect(previousInterlude).toHaveLength(116)
  expect(currentInterlude).toHaveLength(60)
})

it('keeps the refined natural-note ascent, low register and single sextuplet', () => {
  expect(events(bars[36]!)).toEqual([
    ['1', .25], ['7d', .25], ['1', .25], ['2', .25],
    ['3', .25], ['7d', .25], ['1', .25], ['2', .25],
    ['3', .25], ['6d', .25], ['7d', .25], ['1', .25],
    ['2', .25], ['3', .25], ['4', .25], ['5', .25],
  ])
  expect(events(bars[40]!)).toEqual([['3', 1.5], ['2', .5], ['3', 2]])
  expect(events(bars[41]!)).toEqual([['1#', 1.5], ['6d', .5], ['7d', .5], ['1', .5], ['3', .5], ['5', .5]])
  const sextuplet = bars[42]!.events.find(event => event.kind === 'tuplet')!
  expect(sextuplet.pitches).toEqual(['2', '3', '4', '5#', '6', '7'])
  expect(sextuplet.beats).toBe(2)
  expect(events(bars[44]!)).toEqual([['2e', 4]])
})

it('writes the refined modulation at bar 38 and restores C at both vocal entrances', () => {
  expect(bars.slice(35, 45).map(bar => bar.events[0]!.key)).toEqual(['C', 'C', ...Array(8).fill('A')])
  expect(bars[4]!.events[0]!.key).toBe('C')
  expect(bars[45]!.events[0]!.key).toBe('C')
  const played = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(played[45]!.events[0]!.key).toBe('C')
  expect(played[73]!.events[0]!.key).toBe('C')
})
