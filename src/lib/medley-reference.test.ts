import { analyzeM3N, compileScorePerformance, unfoldScorePerformance } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../works/snail-mushroom-waves.m3n?raw'

// Independently read from bf72301c952b57aacee783b9590dcee7.jpeg.
// Original 4/4 image degrees; halve every duration for the 2/4 edition and keep both endings.
const mushroomDegrees = [
  '6d 3 3 3', '3 2 1 2 0', '2 3 2 1', '2 1 6d 5d 6d 0',
  '3d 3d 5d 5d 5d', '6d 6d 2 1 0', '6d 6d 6d 1 2 1 2', '3', '3',
  '6d 3 3 3 3', '3 2 1 2 0', '2 3 2 2 1 1', '2 1 6d 5d 6d 0',
  '3d 3d 5d 5d 5d', '6d 2 1 0 1', '2 2 2 1 6d 5d', '3d 0 7d 6d',
  '6d', '6d', '6d 6 6 6 6 6 6 5', '3 3 2 3 0',
  '6d 2 2 2 2 2 2 3', '2 2 1 2 0', '6d 5 5 5 6d 3 3 3',
  '6d 2 2 2 6d 1 1 1', '3d 0 7d 7d 7d 6d', '6d', '3d 0 7d 7d 7d 6d',
  '7d 7d 7d 7d 7d 7d 7d 6d', '6d 0 5d', '6d 0 0 0',
]

it('transcribes the simplified Mushroom upload with halved durations and both original endings', () => {
  const analysis = analyzeM3N(source)
  expect(analysis.diagnostics).toEqual([])
  const bars = analysis.score.parts.get('score')!.melody.filter(bar => bar.events.length).slice(22, 53)
  const events = bars.flatMap(bar => bar.events)
  const attacks = events.filter((_, index) => !events[index - 1]?.tie)
  const referenceAttacks = mushroomDegrees.flatMap((bar, index) =>
    bar.split(' ').slice([8, 18].includes(index) ? 1 : 0))
  expect(attacks.map(event => event.pitches[0] ?? '0')).toEqual(referenceAttacks)
  expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0)))
    .toEqual(Array(31).fill(2))
  expect(events.slice(0, 9).map(event => event.beats)).toEqual([.5, .5, .5, .5, .25, .25, .5, .5, .5])

})

it('plays the three songs consecutively in C sharp for 236.8 seconds', () => {
  const { score } = analyzeM3N(source)
  const unfolded = unfoldScorePerformance(score)
  const bars = unfolded.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars).toHaveLength(148)
  const sections = bars.flatMap(bar => bar.events.filter(event => event.sectionLabel).map(event => event.sectionLabel))
  expect(sections).toEqual(['蜗牛与黄鹂鸟', '蜗牛与黄鹂鸟', '采蘑菇的小姑娘', '采蘑菇的小姑娘', '踏浪'])
  expect(new Set(bars.flatMap(bar => bar.events.map(event => event.key)))).toEqual(new Set(['C#']))
  expect(new Set(bars.flatMap(bar => bar.events.map(event => `${event.meterCount}/${event.meterUnit}`)))).toEqual(new Set(['2/4']))
  expect(source).not.toContain('完整反复两遍，接下曲')
  const performance = compileScorePerformance(score)
  expect(performance.notes).toContainEqual(expect.objectContaining({ start: 102, end: 106, pitch: 65 }))
  expect(performance.notes).toContainEqual(expect.objectContaining({ start: 122, end: 126, pitch: 58 }))
  // Regression: the first four Mushroom notes last 0.4 seconds each at 75 BPM, not 0.8.
  const opening = performance.notes.filter(note => note.start >= 88 && note.start < 90)
  expect(opening.map(note => (note.end - note.start) * 60 / 75)).toEqual([.4, .4, .4, .4])
  expect(performance.beats).toBe(296)
  expect(performance.tempos).toEqual([{ beat: 0, qpm: 75 }])
  expect(performance.beats * 60 / 75).toBe(236.8)
  // Two complete Snail passes (70.4s), Mushroom (89.6s), then Wave (76.8s).
  expect(bars.slice(0, 44).flatMap(bar => bar.events).reduce((sum, event) => sum + event.beats, 0)).toBe(88)
  expect(bars.slice(44, 100).flatMap(bar => bar.events).reduce((sum, event) => sum + event.beats, 0)).toBe(112)
  // Wave's “山上的山花儿开呀” is in the upper register, not low 6/5.
  expect(bars.slice(116, 118).flatMap(bar => bar.events.map(event => event.pitches[0]))).toEqual(['6', '3', '3', '6', '3', '3', '6', '3', '5', '6'])
})
