import { compileScorePerformance, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/sea_horses_01.m3n?raw'

// Concert pitches independently read from mmexport1795095694039.jpg, page 7.
// Durations are quarter-note beats; R is a rest. One row per printed bar.
const reference = [
  'F#5/.5 E5/.5 D5/.5 E5/.5 F#5/.5 A5/.5 G5/.5 F#5/.5',
  'E5/1 A4/1 E5/1 R/1',
  'D5/.5 C#5/.5 B4/.5 C#5/.5 D5/.5 F#5/.5 E5/.5 D5/.5',
  'C#5/1 F#4/1 C#5/1 R/1',
  'B4/.5 C#5/.5 D5/.5 B4/.5 C#5/.5 D5/.5 E5/.5 A4/.5',
  'F#5/.5 E5/.5 D5/.5 E5/.5 F#5/.5 E5/.5 F#5/.5 G#5/.5',
  'A5/1 G#5/.5 F#5/.5 G#5/1 B5/1',
  'F#5/1 R/.5 F#5/.25 G5/.25 A5/1 R/.5 A4/.5',
  'F5/.5 E5/.5 D5/.5 E5/.5 F5/.5 A5/.5 G5/.5 F5/.5',
  'E5/1 A4/1 E5/1 R/1',
  'D5/.5 C5/.5 Bb4/.5 C5/.5 D5/.5 F5/.5 E5/.5 D5/.5',
  'C5/1 F4/1 C5/1 R/1',
  'Bb4/.5 A4/.5 G4/.5 F4/.5 E4/.5 A4/.5 C#5/.5 G5/.5',
  'G5/1 F5/1 F5/1 R/1',
  'D5/.5 C#5/.5 B4/.5 C#5/.5 D5/.5 F#5/.5 E5/.5 D5/.5',
  'A5/2 R/1 A4/1',
  'F#5/.5 E5/.5 D5/.5 E5/.5 F#5/.5 B5/.25 A5/.25 G5/.5 F#5/.5',
  'E5/.5 F#5/.5 E5/.5 A4/.5 A5/1 R/1',
  'D5/.5 C#5/.5 B4/.5 C#5/.5 D5/.5 G5/.25 F#5/.25 E5/.5 D5/.5',
  'C#5/.5 D5/.5 C#5/.5 F#4/.5 F#5/1 R/1',
  'B4/.5 C#5/.5 D5/.5 B4/.5 C#5/.5 E5/.5 B5/.5 A5/.5',
  'C#5/.5 D5/.5 E5/.5 C#5/.5 G5/.5 A5/.5 Bb5/.5 G5/.5',
  'F#5/.5 G5/.5 F#5/.5 A4/.5 E5/.5 F#5/.5 E5/.5 F#4/.5',
  'D5/1 R/1 C#5/2',
  'B4/.5 C#5/.5 D5/.5 B4/.5 C#5/.5 E5/.5 B5/.5 A5/.5',
  'D5/.5 E5/.5 F#5/.5 D5/.5 G5/.5 A5/.5 Bb5/1',
  'A5/.5 A4/.5 A4/.5 G5/.5 F#5/.5 A4/.5 E5/.5 G4/.5',
  'D5/.5 A5/.5 F#5/.5 D5/.5 D4/2',
].map(row => row.split(' ').map(token => {
  const [pitch, beats] = token.split('/')
  return { pitch, beats: Number(beats) }
}))

it('matches all 28 photographed bars, including naturals, sixteenths and the closing octave drop', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  expect(document).toMatchObject({ key: 'D', meterCount: 2, meterUnit: 2, tempo: 108, preferredWidth: 540 })
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const pitches = resolveScorePitches(bars)
  const accidentals: Record<string, string> = { s: '#', f: 'b' }
  expect(bars.map(bar => bar.events.map(event => {
    const resolved = pitches.get(event)?.[0]
    const [letter, octave, accidental] = resolved?.split(':') ?? []
    return { pitch: resolved ? `${letter!.toUpperCase()}${accidentals[accidental!] ?? ''}${octave}` : 'R', beats: event.beats }
  }))).toEqual(reference)
  expect(compileScorePerformance(document).beats).toBe(112)
  expect(source.match(/\{fermata\}/g)).toHaveLength(2)
})
