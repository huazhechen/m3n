import { compileScorePerformance, formatM3N, parseM3NDocument, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/butter_fly_01.m3n?raw'

const document = parseM3NDocument(source)
const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)

// One-based written bars, including the opening rest bar; zero-based events.
// Audited against the E-major numbered image linked in the score. Bar 10's
// cross-bar C-sharp tie is supplied by the classic E-major vocal staff image.
const ties: Record<number, number[]> = {
  2: [7], 3: [4], 4: [7], 6: [6], 7: [3, 7], 9: [4],
  10: [6], 11: [5], 12: [6], 14: [5], 15: [3, 7],
  18: [4], 22: [4], 24: [3, 7], 25: [3], 28: [1],
  29: [2, 6], 31: [3, 4, 7], 32: [4], 33: [3], 34: [7],
  37: [2, 6], 39: [7], 40: [2, 6], 41: [3], 44: [0],
}

it('matches every pictured tie without joining separately articulated repeated notes', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  expect(bars).toHaveLength(45)
  for (const [index, bar] of bars.entries()) {
    expect(bar.events.flatMap((event, position) => event.tie ? [position] : []), `bar ${index + 1}`)
      .toEqual(ties[index + 1] ?? [])
    expect(bar.events.reduce((sum, event) => sum + event.beats, 0)).toBe(4)
  }
  // The classical vocal sheet keeps separate syllables on these two F-sharps.
  expect(bars[35]!.events.map(event => [event.pitches, event.beats, event.tie ?? false]))
    .toEqual([[['1e'], 1.5, false], [['2e'], .5, false], [['2e'], 1, false], [['3e'], 1, false]])
})

it('sustains both repaired passages through both repeat passes', () => {
  const performance = compileScorePerformance(document)
  expect(performance.beats).toBe(348)
  expect(performance.notes).toHaveLength(348)
  for (const offset of [0, 168]) {
    const crossBar = performance.notes.find(note => note.start === 39.5 + offset)
    expect(crossBar).toMatchObject({ pitch: 73, end: 40.5 + offset })
    expect(performance.notes.some(note => note.start === 40 + offset)).toBe(false)
    const threeEighths = performance.notes.find(note => note.start === 121.5 + offset)
    expect(threeEighths).toMatchObject({ pitch: 76, end: 123 + offset })
    expect(performance.notes.some(note => note.start === 122 + offset || note.start === 122.5 + offset)).toBe(false)
  }
})
