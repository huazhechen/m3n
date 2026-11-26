import { compileScorePerformance, formatM3N, parseM3NDocument, resolveScorePitches, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/butter_fly_01.m3n?raw'
import reference from './fixtures/butter-fly-upload.json'

const document = parseM3NDocument(source)
const part = document.parts.get('score')!
const bars = part.melody.filter(bar => bar.events.length)
const semitones: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const alterations: Record<string, number> = { '': 0, s: 1, f: -1, n: 0 }
const midi = (pitch: string) => {
  const [name, octave, accidental] = pitch.split(':')
  return 12 * (Number(octave) + 1) + semitones[name!.toUpperCase()]! + alterations[accidental!]!
}

it('matches every uploaded fixed-do melody pitch, octave, duration and tie in E-major movable do', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  expect(document.key).toBe('E')
  expect(document.tempo).toBe(106)
  expect(bars).toHaveLength(44)
  expect(part.bass.flatMap(bar => bar.events)).toEqual([])
  const pitches = resolveScorePitches(bars)
  for (const [index, measure] of reference.measures.entries()) {
    const expected = measure.events.split(' ').map(token => {
      const [name, duration] = token.split('/')
      const match = /^([A-G])(#?)([0-9])$/.exec(name!)
      return {
        pitch: match ? 12 * (Number(match[3]) + 1) + semitones[match[1]!]! + (match[2] ? 1 : 0) : null,
        beats: Number(duration!.replace('~', '')),
        tie: duration!.endsWith('~'),
      }
    })
    expect(bars[index]!.events.map(event => ({
      pitch: pitches.get(event)?.[0] ? midi(pitches.get(event)![0]!) : null,
      beats: event.beats,
      tie: Boolean(event.tie),
    })), `PDF measure ${measure.pdfMeasure}`).toEqual(expected)
    expect(bars[index]!.events.reduce((sum, event) => sum + event.beats, 0)).toBe(4)
    expect(bars[index]!.events.every(event => event.pitches.length <= 1)).toBe(true)
  }
})

it('keeps the existing two-pass route and the uploaded vocal ending without piano material', () => {
  expect(bars.filter(bar => bar.left === 'rptstart')).toHaveLength(1)
  expect(bars.filter(bar => bar.right === 'rptend')).toHaveLength(1)
  const expanded = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(expanded).toHaveLength(86)
  const performance = compileScorePerformance(document)
  expect(performance.beats).toBe(344)
  expect(performance.notes.find(note => note.start === 3.5)).toMatchObject({ pitch: 59, end: 4 })
  // PDF 12→13 is G-sharp, never a tie from C-sharp into a rest.
  for (const offset of [0, 168]) {
    expect(performance.notes.find(note => note.start === 11.5 + offset)).toMatchObject({ pitch: 68, end: 12.5 + offset })
    expect(performance.notes.some(note => note.start === 12 + offset)).toBe(false)
  }
  expect(performance.notes.at(-1)).toMatchObject({ pitch: 76, start: 340, end: 342 })
})
