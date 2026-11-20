import { analyzeM3N, compileScorePerformance, unfoldScorePerformance } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../works/snail-mushroom-waves.m3n?raw'

// Independently read from bf72301c952b57aacee783b9590dcee7.jpeg.
// One theme pass followed directly by the image's second ending, before rebaring 4/4 to 2/4.
const mushroomDegrees = [
  '6d 3 3 3', '3 2 1 2 0', '2 3 2 1', '2 1 6d 5d 6d 0',
  '3d 3d 5d 5d 5d', '6d 6d 2 1 0', '6d 6d 6d 1 2 1 2', '3', '3',
  '6d 3 3 3 3', '3 2 1 2 0', '2 3 2 2 1 1', '2 1 6d 5d 6d 0',
  '3d 3d 5d 5d 5d', '6d 2 1 0 1', '2 2 2 1 6d 5d', '3d 0 7d 6d',
  '6d', '6d', '6d 6 6 6 6 6 6 5', '3 3 2 3 0',
  '6d 2 2 2 2 2 2 3', '2 2 1 2 0', '6d 5 5 5 6d 3 3 3',
  '6d 2 2 2 6d 1 1 1', '3d 0 7d 7d 7d 6d',
  '7d 7d 7d 7d 7d 7d 7d 6d', '6d 0 5d', '6d 0 0 0',
]

it('transcribes the simplified Mushroom upload with quarter-note opening and its second ending', () => {
  const analysis = analyzeM3N(source)
  expect(analysis.diagnostics).toEqual([])
  const bars = analysis.score.parts.get('score')!.melody.filter(bar => bar.events.length).slice(22, 80)
  const events = bars.flatMap(bar => bar.events)
  const attacks = events.filter((_, index) => !events[index - 1]?.tie)
  const referenceAttacks = mushroomDegrees.flatMap((bar, index) =>
    bar.split(' ').slice([8, 18].includes(index) ? 1 : 0))
  expect(attacks.map(event => event.pitches[0] ?? '0')).toEqual(referenceAttacks)
  expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0)))
    .toEqual(Array(58).fill(2))
  expect(events.slice(0, 9).map(event => event.beats)).toEqual([1, 1, 1, 1, .5, .5, 1, 1, 1])

})

it('plays the three songs consecutively in C sharp for 240 seconds', () => {
  const { score } = analyzeM3N(source)
  const unfolded = unfoldScorePerformance(score)
  const bars = unfolded.parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(bars).toHaveLength(150)
  const sections = bars.flatMap(bar => bar.events.filter(event => event.sectionLabel).map(event => event.sectionLabel))
  expect(sections).toEqual(['蜗牛与黄鹂鸟', '蜗牛与黄鹂鸟', '采蘑菇的小姑娘', '踏浪'])
  expect(new Set(bars.flatMap(bar => bar.events.map(event => event.key)))).toEqual(new Set(['C#']))
  expect(new Set(bars.flatMap(bar => bar.events.map(event => `${event.meterCount}/${event.meterUnit}`)))).toEqual(new Set(['2/4']))
  expect(source).not.toContain('完整反复两遍，接下曲')
  const performance = compileScorePerformance(score)
  expect(performance.notes).toContainEqual(expect.objectContaining({ start: 116, end: 124, pitch: 65 }))
  expect(performance.notes).toContainEqual(expect.objectContaining({ start: 156, end: 164, pitch: 58 }))
  expect(performance.beats).toBe(300)
  expect(performance.tempos).toEqual([{ beat: 0, qpm: 75 }])
  expect(performance.beats * 60 / 75).toBe(240)
  // Two complete Snail passes (70.4s), Mushroom (92.8s), then Wave (76.8s).
  expect(bars.slice(0, 44).flatMap(bar => bar.events).reduce((sum, event) => sum + event.beats, 0)).toBe(88)
  expect(bars.slice(44, 102).flatMap(bar => bar.events).reduce((sum, event) => sum + event.beats, 0)).toBe(116)
  // Wave's “山上的山花儿开呀” is in the upper register, not low 6/5.
  expect(bars.slice(118, 120).flatMap(bar => bar.events.map(event => event.pitches[0]))).toEqual(['6', '3', '3', '6', '3', '3', '6', '3', '5', '6'])
})
