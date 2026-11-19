import { compileScorePerformance, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/haydn_surprise_minuet_01.m3n?raw'

// Independently read from the treble staff in mmexport1795093284450.jpg.
// Concert pitches; /duration is in quarter-note beats, R denotes a rest.
// Each row follows a printed bar; the two pickups have their own rows.
const reference = [
  'G4/0.5 A4/0.5', // Opening pickup.
  'B4 G4 D5', // 1
  'B4 G4 G5',
  'F#5 D5 C5',
  'A5 R D4/0.5 E4/0.5',
  'F#4 D4 A4', // 5
  'F#4 D4 C5',
  'B4 G4 G4',
  'G5 R G4/0.5 A4/0.5',
  'B4 A4 B4',
  'C5/3', // 10
  'D5 C5 D5',
  'E5/3',
  'C#5 B4 C#5',
  'D5/2 A4/0.5 B4/0.5',
  'C#5 E5 C#5', // 15
  'D5/2',
  'D5', // Second repeat pickup.
  'D5/3', // 17
  'C5/3',
  'Bb4/3',
  'A4 R D4/0.5 E4/0.5', // 20
  'F#4 F#4 F#4/0.5 G4/0.5',
  'A4 A4 A4/0.5 B4/0.5',
  'C5 R R',
  'R R B4/0.5 C5/0.5',
  'D5 R B4/0.5 C5/0.5', // 25
  'D5 R B4/0.5 C5/0.5',
  'D5/0.5 E5/0.5 F#5/0.5 G5/0.5 F#5/0.5 E5/0.5',
  'D5 C5 B4',
  'A4 G4 F#4',
  'G4/3', // 30
  'B4 A4 B4',
  'C5/3',
  'A4 G4 F#4',
  'G4/2', // 34
].map(row => row.split(' ').map(token => {
  const [pitch, duration] = token.split('/')
  return { pitch: pitch!, beats: Number(duration ?? 1) }
}))

it('matches every printed pitch, octave, accidental, rest and duration in the uploaded Minuet', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document).toMatchObject({ key: 'G', meterCount: 3, meterUnit: 4, tempo: 132, arranger: 'David Blackwell' })
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  const alterations: Record<string, string> = { s: '#', f: 'b' }
  const actual = bars.map(bar => bar.events.map(event => {
    const resolved = pitches.get(event)?.[0]
    const [letter, octave, accidental] = resolved?.split(':') ?? []
    return { pitch: resolved ? `${letter!.toUpperCase()}${alterations[accidental!] ?? ''}${octave}` : 'R', beats: event.beats }
  }))
  expect(actual).toEqual(reference)
})

it('plays both sections twice with the correct pitches and pickup timing', () => {
  const document = parseM3NDocument(source)
  const performance = compileScorePerformance(document)
  const first = reference.slice(0, 17).flat(), second = reference.slice(17).flat()
  const semitones: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  let cursor = 0
  const expected = [first, first, second, second].flat().flatMap(event => {
    const start = cursor
    cursor += event.beats
    if (event.pitch === 'R') return []
    const [, letter, accidental, octave] = /^([A-G])([#b]?)(\d)$/.exec(event.pitch)!
    const pitch = 12 * (Number(octave) + 1) + semitones[letter!]! + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0)
    return [[start, cursor, pitch]]
  })
  expect(cursor).toBe(204)
  expect(performance.beats).toBe(cursor)
  expect(performance.notes.map(note => [note.start, note.end, note.pitch])).toEqual(expected)
})
