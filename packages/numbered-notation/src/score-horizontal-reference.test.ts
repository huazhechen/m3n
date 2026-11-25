import { describe, expect, it } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { createScoreHorizontalReference } from './score-horizontal-reference.js'

const spans = [{ id: 'm3n-measure-1-1' }]
const width = (music: string, gap = 9) => createScoreHorizontalReference(analyzeM3N(`{4/4}\nN: ${music} |`).score)(spans, gap, false)!

describe('shared horizontal reading constraints', () => {
  it('budgets extended sounds even when a notation paints only one head', () => {
    expect(width('5^^')).toBeGreaterThan(width('5^'))
    expect(width('5^')).toBeGreaterThan(width('5'))
  })
  it('reserves instrumental enclosures at passage endpoints, not at every note', () => {
    const short = '(5 6 5 6)', long = '(5 6 5 6 5 6 5 6)'
    for (const gap of [9, 12, 15]) {
      expect(width(`{inst}${short}{/}`, gap) - width(short, gap))
        .toBeCloseTo(width(`{inst}${long}{/}`, gap) - width(long, gap))
    }
  })
  it('measures fragments and spacing trials without changing the score or previous results', () => {
    const score = analyzeM3N('{4/4}\nN: (5 6 5 6 5 6 5 6) | 5^^ |').score
    const before = structuredClone(score), reference = createScoreHorizontalReference(score)
    const original = reference(spans, 9, false)!
    const fragment = reference([{ ...spans[0]!, start: 1, end: 3 }], 9, false)!
    expect(fragment).toBeGreaterThan(0)
    expect(fragment).toBeLessThan(original)
    expect(reference(spans, 15, false)).toBeGreaterThan(original)
    expect(reference(spans, 9, false)).toBe(original)
    expect(score).toEqual(before)
  })
})
