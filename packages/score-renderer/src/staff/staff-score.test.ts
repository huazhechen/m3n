import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { prepareStaffScore } from './staff-score.js'

describe('staff page packing', () => {
  it('keeps Turkish March on two pages across the former 550–555px pagination spike', async () => {
    const source = readFileSync(new URL('../../../../src/scores/turkish_march_01.m3n', import.meta.url), 'utf8')
    const score = analyzeM3N(source).score
    const before = structuredClone(score)
    const prepared = await prepareStaffScore(score, { width: 550 })
    let previous = Infinity
    for (let width = 535; width <= 725; width += 5) {
      const count = prepared.pageCount(true, width)
      expect(count, `${width}px must not add a page`).toBeLessThanOrEqual(previous)
      if (width >= 550) expect(count, `${width}px`).toBe(2)
      previous = count
    }
    // Cached counts and independently prepared layouts must agree.
    expect((await prepareStaffScore(score, { width: 555 })).pageCount(true)).toBe(2)
    expect(prepared.pageCount(true, 550)).toBe(2)
    expect(score).toEqual(before)
  }, 30_000)
})
