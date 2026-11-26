import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/an_xiang_01.m3n?raw'

import reference from './fixtures/an-xiang-pdf-reference.json'
import simplified from './fixtures/an-xiang-simplified-reference.json'
import beforeSource from './fixtures/an-xiang-before-simplification.m3n?raw'

// PDF pitches retain their printed C/A keys; compare concert MIDI pitches so
// transcribing the A section in C cannot conceal an octave or accidental error.
const semitones = [0, 2, 4, 5, 7, 9, 11]
const arrangedBars = reference.bars.map(bar => simplified.bars.find(edited => edited.number === bar.number) ?? bar)
const expectedInstrumental = arrangedBars.map(bar => bar.notes.split(' ').map((printedToken, index) => {
  // User edition: replace PDF bar 37's opening rest with the same 1 as beat 3.
  const token = bar.number === 37 && index === 0 ? '1/.25' : printedToken
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

it('matches the PDF introduction and approved simplified interlude in concert pitch, rhythm and ties', () => {
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

it('plays the introduction and interlude once and jumps to Coda on the second vocal pass without houses', () => {
  const played = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
  const expected = [...bars.slice(0, 47), ...bars.slice(4, 32), ...bars.slice(47)]
  expect(played.map(events)).toEqual(expected.map(events))
  expect(played).toHaveLength(80)
  expect(compileScorePerformance(document).beats).toBe(320)
  expect(bars.flatMap((bar, index) => bar.left === 'rptstart' ? [index + 1] : [])).toEqual([5])
  expect(bars.flatMap((bar, index) => bar.right === 'rptend' ? [index + 1] : [])).toEqual([47])
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

it('keeps four half-beat triplet groups and preserves the approved opening 1', () => {
  const tuplets = bars[45]!.events.filter(event => event.kind === 'tuplet')
  expect(tuplets).toHaveLength(4)
  expect(tuplets.map(event => [event.pitches.length, event.beats])).toEqual(Array(4).fill([3, .5]))
  expect(events(bars[36]!).slice(0, 1)).toEqual([['1', .25]])
  expect(events(bars[36]!)[0]).toEqual(events(bars[36]!)[8])
})

it('plays the simplified melody without extra attacks on the retained sustained note', () => {
  let cursor = 144 // First ending: the instrumental section starts at written bar 37.
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
  const actual = compileScorePerformance(document).notes.filter(note => note.start >= 144 && note.start < 188)
  expect(actual).toHaveLength(expected.length)
  for (const [index, note] of actual.entries()) {
    expect(note.pitch).toBe(expected[index]!.pitch)
    expect(note.start).toBeCloseTo(expected[index]!.start)
    expect(note.end).toBeCloseTo(expected[index]!.end)
  }
  // Repeated chord attacks are merged by the approved simplification.
  expect(actual.filter(note => note.start >= 156 && note.start < 159).map(note => note.start)).toEqual([156])
  expect(expectedInstrumental.slice(4).flat().filter(note => note.tie)).toHaveLength(2)
})

it('keeps every vocal and introduction pitch and timing, and lightly reduces the interlude note count', () => {
  const beforeDocument = parseM3NDocument(beforeSource)
  const before = compileScorePerformance(beforeDocument), after = compileScorePerformance(document)
  const outsideInterlude = (note: { start: number }) => note.start < 144 || note.start >= 188
  const previous = before.notes.filter(outsideInterlude), current = after.notes.filter(outsideInterlude)
  expect(current).toHaveLength(previous.length)
  for (const [index, note] of current.entries()) {
    expect(note.pitch).toBe(previous[index]!.pitch)
    expect(note.start).toBeCloseTo(previous[index]!.start)
    expect(note.end).toBeCloseTo(previous[index]!.end)
  }
  expect(after.beats).toBe(before.beats)
  expect(document.lyrics.map(block => block.syllables.map(syllable => syllable.text))).toEqual(
    beforeDocument.lyrics.map(block => block.syllables.map(syllable => syllable.text)),
  )
  const currentInterlude = after.notes.filter(note => !outsideInterlude(note))
  const previousInterlude = before.notes.filter(note => !outsideInterlude(note))
  expect(previousInterlude).toHaveLength(116)
  expect(currentInterlude).toHaveLength(100)
  // Every retained pitch comes from the same PDF bar, including its A-key octave.
  const previousBars = beforeDocument.parts.get('score')!.melody.filter(bar => bar.events.length)
  const previousPitches = resolveScorePitches(previousBars), currentPitches = resolveScorePitches(bars)
  for (let index = 36; index < 47; index++) {
    const allowed = new Set(previousBars[index]!.events.flatMap(event => (previousPitches.get(event) ?? []).map(pitch => pitch.replace(/:n$/, ':'))))
    for (const pitch of bars[index]!.events.flatMap(event => currentPitches.get(event) ?? [])) {
      expect(allowed.has(pitch.replace(/:n$/, ':')), `written bar ${index + 1}: ${pitch}`).toBe(true)
    }
  }
})

it('retains the distinctive final-beat 32nd-note ascent from the uploaded image with the corrected PDF pitches', () => {
  const notes = events(bars[37]!)
  expect(notes.slice(-8)).toEqual([
    ['3e', .125], ['6', .125], ['7', .125], ['1#e', .125],
    ['2e', .125], ['3e', .125], ['4#e', .125], ['5#e', .125],
  ])
  expect(notes.slice(0, -8).reduce((sum, note) => sum + Number(note[1]), 0)).toBeCloseTo(3)
})

it('limits repeated-note merging to the rhythms explicitly shown in image interlude bars 3–5', () => {
  // Image bar 3: half note tied to an eighth, followed by three eighths.
  expect(events(bars[38]!).map(note => note[1])).toEqual([2, .5, .5, .5, .5])
  expect(bars[38]!.events[0]!.tie).toBe(true)
  // Image bar 4 sustains the repeated pitch for three beats. Keep the PDF
  // ornamental final beat, rather than deleting it again.
  expect(events(bars[39]!).map(note => note[1])).toEqual([3, .75, .125, .125])
  // Image bar 5: half note, quarter note, two eighths; corrected PDF pitches.
  expect(events(bars[40]!)).toEqual([['5#ee', 2], ['4#ee', 1], ['3ee', .5], ['2ee', .5]])
})
