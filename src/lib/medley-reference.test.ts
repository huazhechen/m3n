import { analyzeM3N, compileScorePerformance, unfoldScorePerformance } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../works/snail-mushroom-waves.m3n?raw'

// Read independently from the three user-uploaded screenshots (20 November 2026).
// Mushroom's lower octave dots and the short 2/4 bars are easy to miss in the long image.
const mushroomDegrees = [
  '6d 3d 3 3 3 2 1 2 0', '2 3 2 1 2 1 6d 5d 6d 0',
  '3d 3d 5d 6d 5d 6d 6d 2 1 0', '6d 6d 6d 1 2 1 2 3', '3 0',
  '6d 3 3 3 3 3 2 1 2 0', '2 3 2 2 1 1 2 1 6d 5d 6d 0',
  '3d 3d 5d 5d 5d 6d 2 1 0', '2 2 2 1 6d 5d 3d 7d', '6d 0',
  '6d 6 6 6 6 6 5 3 3 2 3 0', '6d 2 2 2 2 2 3 2 2 1 2 0',
  '6d 5 5 5 6d 3 3 3 6d 2 2 2 6d 1 1 1', '3d 7d 7d 5d 6d', '6d 0',
  '6d 3 3 3 3 3 3 2 1 2 0', '2 3 2 1 2 1 6d 5d 6d 0',
  '3d 3d 5d 6d 5d 5d 6d 6d 2 1 0', '6d 6d 6d 1 2 1 2 3', '3 0',
  '6d 3 3 3 3 2 1 2 0', '2 2 3 2 1 2 1 6d 5d 6d 0',
  '3d 3d 5d 6d 5d 5d 6d 2 1 0', '2 2 2 1 6d 5d 3d 7d', '6d 0',
  '6d 6 6 6 6 6 5 3 3 2 3 0', '6d 2 2 2 2 2 3 2 2 1 2 0',
  '6d 5 5 5 6d 3 3 3 6d 2 2 2 6d 1 1 1',
  '3d 7d 7d 7d 7d 7d 7d 7d 7d 7d 7d 7d 7d', '7d 7d 7d 5d 6d 5d 6d 0',
]

it('transcribes the uploaded Mushroom melody with its octave dots, ties and mixed meter', () => {
  const analysis = analyzeM3N(source)
  expect(analysis.diagnostics).toEqual([])
  const bars = analysis.score.parts.get('score')!.melody.filter(bar => bar.events.length).slice(22, 52)
  expect(bars.map(bar => bar.events.map(event => event.pitches[0] ?? '0').join(' '))).toEqual(mushroomDegrees)
  expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0)))
    .toEqual(Array.from({ length: 30 }, (_, index) => [4, 14, 19].includes(index) ? 2 : 4))
  expect(bars[0]!.events.map(event => event.beats)).toEqual([.5, .5, .5, .5, .25, .25, .5, .75, .25])
  for (const index of [3, 13, 18]) expect(bars[index]!.events.at(-1)!.tie).toBe(true)
})

it('plays the three songs consecutively in C sharp for 238.4 seconds', () => {
  const { score } = analyzeM3N(source)
  const unfolded = unfoldScorePerformance(score)
  const bars = unfolded.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars).toHaveLength(98)
  const sections = bars.flatMap(bar => bar.events.filter(event => event.sectionLabel).map(event => event.sectionLabel))
  expect(sections).toEqual(['蜗牛与黄鹂鸟', '蜗牛与黄鹂鸟', '采蘑菇的小姑娘', '踏浪'])
  expect(new Set(bars.flatMap(bar => bar.events.map(event => event.key)))).toEqual(new Set(['C#']))
  const performance = compileScorePerformance(score)
  expect(performance.beats).toBe(298)
  expect(performance.tempos).toEqual([{ beat: 0, qpm: 75 }])
  expect(performance.beats * 60 / 75).toBe(238.4)
  // Two complete Snail passes (70.4s), Mushroom (91.2s), then Wave (76.8s).
  expect(bars.slice(0, 44).flatMap(bar => bar.events).reduce((sum, event) => sum + event.beats, 0)).toBe(88)
  expect(bars.slice(44, 74).flatMap(bar => bar.events).reduce((sum, event) => sum + event.beats, 0)).toBe(114)
  // Wave's “山上的山花儿开呀” is in the upper register, not low 6/5.
  expect(bars[82]!.events.map(event => event.pitches[0])).toEqual(['6', '3', '3', '6', '3', '3', '6', '3', '5', '6'])
})
