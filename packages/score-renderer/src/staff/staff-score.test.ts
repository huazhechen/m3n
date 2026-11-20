import { readFileSync } from 'node:fs'
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
import { analyzeM3N } from '@m3n/notation'
import { prepareStaffScore } from './staff-score.js'

describe('staff page packing', () => {
  it('caches candidate layouts without mutating input or changing pagination geometry', async () => {
    const source = readFileSync(`../../src/scores/turkish_march_01.m3n`, 'utf8')
    const score = analyzeM3N(source).score
    const before = structuredClone(score)
    const prepared = await prepareStaffScore(score, { width: 550 })
    for (const width of [540, 550, 640, 720]) {
      const count = prepared.pageCount(true, width)
      expect(count).toBeGreaterThan(0)
      expect(prepared.layoutInfo(width).pages).toHaveLength(count)
      expect(prepared.pageCount(true, width)).toBe(count)
    }
    expect((await prepareStaffScore(score, { width: 550 })).layoutInfo()).toEqual(prepared.layoutInfo(550))
    expect(score).toEqual(before)
  }, 120_000)
})
