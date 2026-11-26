import { compileScorePerformance, formatM3N, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/butter_fly_01.m3n?raw'
import vocalSource from './fixtures/butter-fly-vocal-rhythm.m3n?raw'

const document = parseM3NDocument(source)
const original = parseM3NDocument(vocalSource)
const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
const vocalBars = original.parts.get('score')!.melody.filter(bar => bar.events.length)

it('keeps every vocal duration, rest, tie and repeated-note articulation', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  expect(document.key).toBe('E')
  expect(document.tempo).toBe(165)
  expect(bars).toHaveLength(45)
  const rhythm = (measures: typeof bars) => measures.map(bar => ({
    left: bar.left, right: bar.right,
    events: bar.events.map(event => ({ kind: event.kind, beats: event.beats, tie: Boolean(event.tie) })),
  }))
  expect(rhythm(bars)).toEqual(rhythm(vocalBars))
  expect(source).toContain('{lg}(5 3){/}')
  expect(bars.flatMap(bar => bar.events.filter(event => event.tie))).toHaveLength(34)
  expect(bars.slice(0, 12).flatMap(bar => bar.events.filter(event => event.tie))).toHaveLength(10)
  expect(bars[9]!.events[4]!.beats).toBe(1)
  expect(bars[11]!.events[4]!.beats).toBe(1)
  expect(document.parts.get('score')!.bass.flatMap(bar => bar.events)).toEqual([])
  expect(bars.every(bar => bar.events.reduce((sum, event) => sum + event.beats, 0) === 4)).toBe(true)
})

it('retains fixed-do pitch corrections that fit the vocal rhythm and ties', () => {
  const pitches = resolveScorePitches(bars)
  const vocalPitches = resolveScorePitches(vocalBars)
  // One-based written measure / zero-based event, including the pickup bar.
  // PDF 10, 12, 14, 16, 20, 22, 24 and 36; fixed C do → E-major movable do.
  const corrections: Record<string, string> = {
    '1/3': 'b:3:', '3/3': 'e:4:', '5/4': 'g:4:n', '5/6': 'g:4:n',
    '7/5': 'g:4:s', '11/4': 'e:4:', '13/3': 'g:4:n', '15/5': 'g:4:s', '27/4': 'c:5:s',
  }
  for (const [index, bar] of bars.entries()) for (const [position, event] of bar.events.entries()) {
    expect(pitches.get(event)?.[0], `written measure ${index + 1}, event ${position}`)
      .toBe(corrections[`${index + 1}/${position}`] ?? vocalPitches.get(vocalBars[index]!.events[position]!)?.[0])
  }
})

it('does not add attacks or gaps anywhere in either repeat pass', () => {
  const performance = compileScorePerformance(document)
  const vocalPerformance = compileScorePerformance(original)
  expect(performance.beats).toBe(348)
  expect(performance.notes).toHaveLength(348)
  expect(performance.notes.map(note => [note.start, note.end]))
    .toEqual(vocalPerformance.notes.map(note => [note.start, note.end]))
  expect(performance.notes.filter(note => note.start < 48)).toHaveLength(50)
  for (const offset of [0, 168]) {
    expect(performance.notes.find(note => note.start === 39.5 + offset))
      .toMatchObject({ pitch: 73, end: 40.5 + offset })
    expect(performance.notes.some(note => note.start === 40 + offset)).toBe(false)
    expect(performance.notes.find(note => note.start === 121.5 + offset))
      .toMatchObject({ pitch: 76, end: 123 + offset })
    expect(performance.notes.some(note => note.start === 122 + offset || note.start === 122.5 + offset)).toBe(false)
  }
})
