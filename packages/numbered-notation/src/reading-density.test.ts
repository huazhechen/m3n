import { expect, it } from 'vitest'
import { scoreReadingWindows } from './reading-density.js'

it('detects a tight beat even when the complete measure has ample space', () => {
  const reading = scoreReadingWindows([
    { beat: 0, x: 0, preferredNext: 16 }, { beat: .25, x: 9, preferredNext: 16 },
    { beat: .5, x: 18, preferredNext: 16 }, { beat: 1, x: 60, preferredNext: 24 },
    { beat: 3, x: 150, preferredNext: 0 },
  ])
  expect(reading.worstRatio).toBeGreaterThan(1)
  expect(reading.penalty).toBeGreaterThan(0)
  expect(reading.windows.every(window => window.beats === 1 || window.beats === 2)).toBe(true)
  expect(scoreReadingWindows([{ beat: 0, x: 0, preferredNext: 16 }, { beat: .25, x: 20, preferredNext: 0 }]).penalty).toBe(0)
  expect(scoreReadingWindows([]).worstRatio).toBe(1)
})
