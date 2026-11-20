import { readFileSync } from 'node:fs'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { describe, expect, it } from 'vitest'
import { planNativeLines, type NativeLineCandidate } from './native-line-breaking.js'

function candidatesFor(widths: number[], capacity = 100): NativeLineCandidate[][] {
  return widths.map((_, start) => {
    const rows: NativeLineCandidate[] = []
    let occupied = 0
    for (let end = start; end < widths.length; end++) {
      occupied += widths[end]!
      if (occupied > capacity && end > start) break
      rows.push({ end: end + 1, density: occupied / capacity })
    }
    return rows
  })
}

// Independent exhaustive oracle: score complete partitions, without DP states
// or pruning.
function score(rows: NativeLineCandidate[], relaxLastLine = false) {
  return rows.reduce((sum, row, i) => {
    const difference = i ? row.density - rows[i - 1]!.density : 0
    const factor = relaxLastLine && i === rows.length - 1 && row.density <= .6 ? .5 : 1
    return sum + 1 + factor * Math.max(0, 1 - row.density) ** 2 + 100 * Math.max(0, row.density - 1) ** 2
      + (row.penalty ?? 0) + factor * difference ** 2
  }, 0)
}

function enumerate(candidates: NativeLineCandidate[][], start = 0): NativeLineCandidate[][] {
  if (start === candidates.length) return [[]]
  return candidates[start]!.flatMap(row => enumerate(candidates, row.end).map(rest => [row, ...rest]))
}

function selected(candidates: NativeLineCandidate[][], ends: number[]) {
  let start = 0
  return ends.map(end => {
    const row = candidates[start]!.find(row => row.end === end)!
    start = end
    return row
  })
}

describe('adjacent-row density planning', () => {
  it('selects the lower adjacent-density cost without penalising changes in direction', () => {
    const candidates = candidatesFor([23, 45, 41, 38, 61, 34, 73, 16, 60, 60])
    const adjacent = [2, 4, 6, 7, 9, 10], former = [2, 4, 6, 8, 9, 10]
    expect(planNativeLines(candidates)).toEqual(adjacent)
    expect(score(selected(candidates, adjacent))).toBeLessThan(score(selected(candidates, former)))
  })

  it('balances Clarinet Polka section B into three rows of three measures at its preferred width', () => {
    const source = readFileSync(new URL('../../../src/scores/dan_huang_guan_bo_er_ka_01.m3n', import.meta.url), 'utf8')
    const document = parseM3NDocument(source)
    const layout = layoutNativeScore(document, { width: 720, paged: false })
    // B follows the 17 written measures of A, including its pickup.
    const section = new Set(layout.projection.measures.slice(17, 26))
    const rows = layout.systems.filter(system => system.measures.some(measure => section.has(measure)))
    expect(rows.map(system => system.measures.length)).toEqual([3, 3, 3])
    expect(rows.flatMap(system => system.measures)).toEqual([...section])
  })

  it('looks ahead before committing an early break instead of filling each row greedily', () => {
    expect(planNativeLines(candidatesFor([30, 30, 40, 40, 40, 40]))).toEqual([2, 4, 6])
  })

  it('still balances avoidable short tails and does not add rows just to obtain a relaxed ending', () => {
    expect(planNativeLines(candidatesFor([30, 30, 40, 40, 40, 40]), { relaxLastLine: true })).toEqual([2, 4, 6])
    expect(planNativeLines(candidatesFor([90, 90, 30, 30]), { relaxLastLine: true })).toEqual([1, 2, 4])
  })

  it('matches exhaustive global scoring across varied widths and beat penalties', () => {
    let seed = 17
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
    for (let trial = 0; trial < 100; trial++) {
      const candidates = candidatesFor(Array.from({ length: 4 + trial % 7 }, () => 10 + Math.floor(random() * 100)), 70 + trial % 4 * 10)
      for (let start = 1; start < candidates.length; start++) if (random() < .3) for (const row of candidates[start]!) row.penalty = 1
      const before = structuredClone(candidates)
      for (const relaxLastLine of [false, true]) {
        const result = planNativeLines(candidates, { relaxLastLine })
        const optimum = Math.min(...enumerate(candidates).map(rows => score(rows, relaxLastLine)))
        expect(score(selected(candidates, result), relaxLastLine), `trial ${trial}, relaxed=${relaxLastLine}`).toBeCloseTo(optimum, 10)
        expect(result.at(-1)).toBe(candidates.length)
      }
      expect(candidates).toEqual(before)
    }
  })

  it('handles zero, one and two rows without inventing endpoint neighbours', () => {
    expect(planNativeLines([])).toEqual([])
    expect(planNativeLines(candidatesFor([20, 30]))).toEqual([2])
    expect(planNativeLines(candidatesFor([70, 70]))).toEqual([1, 2])
  })

  it('keeps indivisible oversized objects and stable ties with shorter rows last', () => {
    expect(planNativeLines(candidatesFor([120, 30, 30]))).toEqual([1, 3])
    expect(planNativeLines(candidatesFor([40, 40, 40, 40, 40]))).toEqual([2, 4, 5])
  })

  it('plans long sparse sequences without enumerating complete partitions', () => {
    const result = planNativeLines(candidatesFor(Array(600).fill(10)))
    expect(result).toEqual(Array.from({ length: 60 }, (_, i) => (i + 1) * 10))
  })
})
