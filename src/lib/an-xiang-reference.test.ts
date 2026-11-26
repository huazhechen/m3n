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
  // User edition: overlap the vocal ending with PDF bar 37; sing 3 for
  // one sixteenth, then play the remaining fifteen instrumental sixteenths.
  const token = bar.number === 37 && index === 0 ? '3/.25' : printedToken
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
  expect(bars).toHaveLength(51)
  expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0))).toEqual(Array(51).fill(4))
  const resolved = resolveScorePitches(bars)
  const actual = [...bars.slice(0, 4), ...bars.slice(35, 46)].map(bar => bar.events.flatMap<{ midi: number | null; beats: number; tie: boolean }>(event => {
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
  const expected = [...bars.slice(0, 46), ...bars.slice(4, 32), ...bars.slice(46)]
  expect(played.map(events)).toEqual(expected.map(events))
  expect(played).toHaveLength(79)
  expect(compileScorePerformance(document).beats).toBe(316)
  expect(bars.flatMap((bar, index) => bar.left === 'rptstart' ? [index + 1] : [])).toEqual([5])
  expect(bars.flatMap((bar, index) => bar.right === 'rptend' ? [index + 1] : [])).toEqual([46])
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
  expect([48, 49, 50].map(lyrics)).toEqual(['', '残留', ''])
  expect([...bars.slice(0, 4), ...bars.slice(36, 46)].flatMap(bar => bar.events)
    .flatMap(event => lyricsByEvent.get(event) ?? []).filter(lyric => lyric.kind === 'text')).toEqual([])
  expect(source).not.toMatch(/\{(?:ac|ap)\(/)
  expect(bars.flatMap(bar => bar.events.flatMap(event => event.postfixes))).toEqual([])
  expect(bars[47]!.events.at(-1)!.tie).toBe(true)
  expect(events(bars[49]!)).toEqual([['5', 2], ['6', 2]])
  expect(bars[49]!.events[1]!.tie).toBe(true)
  expect(events(bars[50]!)).toEqual([['6', 4]])
})

it('sings a single sixteenth on 留 then joins the remaining interlude notes without an extra bar', () => {
  const tuplets = bars[44]!.events.filter(event => event.kind === 'tuplet')
  expect(tuplets).toHaveLength(4)
  expect(tuplets.map(event => [event.pitches.length, event.beats])).toEqual(Array(4).fill([3, .5]))
  expect(events(bars[35]!)).toEqual([
    ['3', .25], ['7d', .25], ['1', .25], ['2', .25],
    ['3', .25], ['7d', .25], ['1', .25], ['2', .25],
    ['1', .25], ['7d', .25], ['1', .25], ['2', .25],
    ['3', .25], ['6', .25], ['7', .25], ['6', .25],
  ])
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const texts = (event: typeof bars[number]['events'][number]) => (lyricsByEvent.get(event) ?? [])
    .filter(lyric => lyric.kind === 'text').map(lyric => lyric.text)
  expect(texts(bars[35]!.events[0]!)).toEqual(['留'])
  expect(bars[35]!.events.slice(1).flatMap(texts)).toEqual([])
  const transition = compileScorePerformance(document).notes.filter(note => note.start >= 140 && note.start < 141)
  expect(transition.map(note => [note.pitch, note.start, note.end])).toEqual([
    [64, 140, 140.25], [59, 140.25, 140.5], [60, 140.5, 140.75], [62, 140.75, 141],
  ])
})

it('plays the simplified melody without extra attacks on the retained sustained note', () => {
  let cursor = 140 // Written bar 36: vocal sixteenth followed by instrumental notes.
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
  const actual = compileScorePerformance(document).notes.filter(note => note.start >= 140 && note.start < 184)
  expect(actual).toHaveLength(expected.length)
  for (const [index, note] of actual.entries()) {
    expect(note.pitch).toBe(expected[index]!.pitch)
    expect(note.start).toBeCloseTo(expected[index]!.start)
    expect(note.end).toBeCloseTo(expected[index]!.end)
  }
  // Repeated chord attacks are merged by the approved simplification.
  expect(actual.filter(note => note.start >= 152 && note.start < 155).map(note => note.start)).toEqual([152])
  expect(expectedInstrumental.slice(4).flat().filter(note => note.tie)).toHaveLength(3)
})

it('preserves the other vocals and introduction while removing four beats at the vocal/interlude overlap', () => {
  const beforeDocument = parseM3NDocument(beforeSource)
  const before = compileScorePerformance(beforeDocument), after = compileScorePerformance(document)
  const previous = before.notes.filter(note => note.start < 140 || note.start >= 188)
  const current = after.notes.filter(note => note.start < 140 || note.start >= 184)
  expect(current).toHaveLength(previous.length)
  for (const [index, note] of current.entries()) {
    const prior = previous[index]!
    const shift = prior.start >= 188 ? 4 : 0
    expect(note.pitch).toBe(prior.pitch)
    expect(note.start).toBeCloseTo(prior.start - shift)
    expect(note.end).toBeCloseTo(prior.end - shift)
  }
  expect(after.beats).toBe(before.beats - 4)
  expect(document.lyrics.map(block => block.syllables.map(syllable => syllable.text))).toEqual(
    beforeDocument.lyrics.map(block => block.syllables.map(syllable => syllable.text)),
  )
  const currentInterlude = after.notes.filter(note => note.start >= 140 && note.start < 184)
  const previousInterlude = before.notes.filter(note => note.start >= 144 && note.start < 188)
  expect(previousInterlude).toHaveLength(116)
  expect(currentInterlude).toHaveLength(113)
  // The historical baseline misread bar 43's opening octave; the corrected
  // concert-pitch PDF comparison above is authoritative for instrumental notes.
  const restored42 = expectedInstrumental[9]!
  expect(restored42.slice(0, 3).map(note => note.midi)).toEqual([85, 88, 86])
  expect(restored42).toHaveLength(27)
  const played43 = currentInterlude.filter(note => note.start >= 164 && note.start < 168)
  expect(played43[0]!.pitch).toBe(66) // PDF low 6 in A: F♯4, not F♯5.
  expect(played43.at(-2)!.pitch).toBe(78) // The ending 6 has no lower dot.
})

it('retains the distinctive final-beat 32nd-note ascent from the uploaded image with the corrected PDF pitches', () => {
  const notes = events(bars[36]!)
  expect(notes.slice(-8)).toEqual([
    ['3e', .125], ['6', .125], ['7', .125], ['1#e', .125],
    ['2e', .125], ['3e', .125], ['4#e', .125], ['5#e', .125],
  ])
  expect(notes.slice(0, -8).reduce((sum, note) => sum + Number(note[1]), 0)).toBeCloseTo(3)
})

it('limits repeated-note merging to the rhythms explicitly shown in image interlude bars 3–5', () => {
  // Image bar 3: half note tied to an eighth, followed by three eighths.
  expect(events(bars[37]!).map(note => note[1])).toEqual([2, .5, .5, .5, .5])
  expect(bars[37]!.events[0]!.tie).toBe(true)
  // Image bar 4 sustains the repeated pitch for three beats. Keep the PDF
  // ornamental final beat, rather than deleting it again.
  expect(events(bars[38]!).map(note => note[1])).toEqual([3, .75, .125, .125])
  // Image bar 5: half note, quarter note, two eighths; corrected PDF pitches.
  expect(events(bars[39]!)).toEqual([['7e', 2], ['6e', 1], ['5e', .5], ['4e', .5]])
})

it('writes the PDF modulation at PDF bar 39 (written bar 38) and restores C at both vocal entrances', () => {
  expect(bars.slice(35, 46).map(bar => bar.events[0]!.key)).toEqual(['C', 'C', ...Array(9).fill('A')])
  expect(bars[4]!.events[0]!.key).toBe('C')
  expect(bars[46]!.events[0]!.key).toBe('C')
  const played = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(played[46]!.events[0]!.key).toBe('C')
  expect(played[74]!.events[0]!.key).toBe('C')
})
