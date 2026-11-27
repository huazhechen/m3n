import { describe, expect, it } from 'vitest'
import { sortedScoreInkSeparation } from './ink-separation.js'
import type { NativeInk } from '../native-ink.js'

const exhaustive = (upper: NativeInk[], lower: NativeInk[]) => {
  let distance = -Infinity
  for (const a of upper) for (const b of lower) if (Math.min(a.right, b.right) > Math.max(a.left, b.left)) distance = Math.max(distance, a.bottom - b.top)
  return distance
}
const compare = (upper: NativeInk[], lower: NativeInk[]) => expect(sortedScoreInkSeparation(
  [...upper].sort((a, b) => a.left - b.left), [...lower].sort((a, b) => a.left - b.left),
)).toBe(exhaustive(upper, lower))

describe('horizontal ink sweep for vertical pagination', () => {
  it('matches touching boundaries, nested spans, expired leaders and zero-width marks', () => {
    const upper = [
      { left: 0, right: 10, top: 0, bottom: 100 },
      { left: 1, right: 2, top: 0, bottom: 200 },
      { left: 20, right: 30, top: 0, bottom: 50 },
      { left: 25, right: 25, top: 0, bottom: 1000 },
    ]
    compare(upper, [
      { left: 10, right: 20, top: -1000, bottom: 0 },
      { left: 3, right: 25, top: -10, bottom: 0 },
      { left: 21, right: 22, top: -20, bottom: 0 },
      { left: 25, right: 25, top: -1000, bottom: 0 },
    ])
    compare([], upper); compare(upper, [])
  })
  it('matches exhaustive separation across randomized row pairs', () => {
    let seed = 98765
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
    const row = () => Array.from({ length: 80 }, () => {
      const left = random() * 500 - 100, top = random() * 50 - 25
      return { left, right: left + random() * 80, top, bottom: top + random() * 50 }
    })
    for (let i = 0; i < 100; i++) compare(row(), row())
  })
})
