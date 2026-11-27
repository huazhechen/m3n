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
function score(rows: NativeLineCandidate[]) {
  const stretches = rows.map(row => Math.max(0, 1 - row.density))
  const mean = stretches.reduce((sum, value) => sum + value, 0) / Math.max(1, rows.length)
  return rows.reduce((sum, row, index) => sum + stretches[index]! ** 2 + (stretches[index]! - mean) ** 2
    + 100 * Math.max(0, row.density - 1) ** 2 + (row.penalty ?? 0), 0)
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

describe('full-score stretch planning', () => {
  it('minimises whole-score variance rather than adjacent-row differences', () => {
    const candidates = candidatesFor([23, 45, 41, 38, 61, 34, 73, 16, 60, 60])
    const result = planNativeLines(candidates)
    const optimum = Math.min(...enumerate(candidates).map(score))
    expect(score(selected(candidates, result))).toBeCloseTo(optimum, 12)
  })

  it('uses a feasible cost ceiling without changing the optimum or its tie break', () => {
    for (let trial = 0; trial < 100; trial++) {
      const candidates = candidatesFor(Array.from({ length: 4 + trial % 6 }, (_, index) => 15 + (trial * 17 + index * 31) % 80))
      const expected = planNativeLines(candidates)
      const cost = score(selected(candidates, expected))
      expect(planNativeLines(candidates, undefined, cost + 1e-10)).toEqual(expected)
      expect(planNativeLines(candidates, undefined, cost - .0001)).toBeUndefined()
    }
  })
  it('compares forced-break regions in one full-score objective', () => {
    const candidates = candidatesFor([25, 35, 30, 25, 20, 45, 30, 25, 30])
    // No candidate may cross the forced break after the fourth measure.
    for (let start = 0; start < 4; start++) candidates[start] = candidates[start]!.filter(row => row.end <= 4)
    const result = planNativeLines(candidates)
    expect(result).toContain(4)
    expect(score(selected(candidates, result))).toBeCloseTo(Math.min(...enumerate(candidates).map(score)), 12)
  })

  it('scores the last row as fully justified and forbids rows beyond hard minima', () => {
    expect(planNativeLines(candidatesFor([34, 34, 34]))).toEqual([2, 3])
    expect(planNativeLines(candidatesFor([25, 25, 25]))).toEqual([3])
  })

  it('balances Clarinet Polka section B into three rows of three measures at 720px with 0.6em spacing', () => {
    const source = readFileSync(new URL('../../../src/scores/dan_huang_guan_bo_er_ka_01.m3n', import.meta.url), 'utf8')
    const document = parseM3NDocument(source)
    const layout = layoutNativeScore(document, { width: 720, paged: false, minimumNoteGap: 15 })
    // B follows the 17 written measures of A, including its pickup.
    const section = new Set(layout.projection.measures.slice(17, 26))
    const rows = layout.systems.filter(system => system.measures.some(measure => section.has(measure)))
    expect(rows.map(system => system.measures.length)).toEqual([3, 3, 3])
    expect(rows.flatMap(system => system.measures)).toEqual([...section])
  })

  it('looks ahead before committing an early break instead of filling each row greedily', () => {
    expect(planNativeLines(candidatesFor([30, 30, 40, 40, 40, 40]))).toEqual([2, 4, 6])
  })

  it('allows unavoidable short tails while scoring every row equally', () => {
    expect(planNativeLines(candidatesFor([30, 30, 40, 40, 40, 40]))).toEqual([2, 4, 6])
    expect(planNativeLines(candidatesFor([90, 90, 30, 30]))).toEqual([1, 2, 4])
  })

  it('does not prefer a short final row over balanced Red River Valley rows at 480px', () => {
    // Actual browser-measured minimum widths at 0.6em; includes the pickup.
    const widths = [46.6293844628, 142.1124391210, 122.1847213036, 163.7143604291,
      109.2634219384, 142.1124391210, 122.1847213036, 142.1124391210, 72.2865374756]
    expect(planNativeLines(candidatesFor(widths, 480))).toEqual([3, 6, 9])
    const source = readFileSync(new URL('../../../src/scores/hong_he_gu_01.m3n', import.meta.url), 'utf8')
    const layout = layoutNativeScore(parseM3NDocument(source), { width: 480, pageMargin: 0, paged: true, minimumNoteGap: 8 })
    expect(layout.systems.map(system => system.measures.length)).toEqual([3, 3, 3])
  })

  it('matches exhaustive global scoring across varied widths and beat penalties', () => {
    let seed = 17
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
    for (let trial = 0; trial < 300; trial++) {
      const candidates = candidatesFor(Array.from({ length: 4 + trial % 7 }, () => 10 + Math.floor(random() * 100)), 70 + trial % 4 * 10)
      for (let start = 1; start < candidates.length; start++) if (random() < .3) for (const row of candidates[start]!) row.penalty = 1
      const before = structuredClone(candidates)
      const result = planNativeLines(candidates)
      const optimum = Math.min(...enumerate(candidates).map(rows => score(rows)))
      expect(score(selected(candidates, result)), `trial ${trial}`).toBeCloseTo(optimum, 10)
      expect(result.at(-1)).toBe(candidates.length)
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

it('retains prefix statistics when a fixed prefix leads to alternative suffixes',()=>{
 const prefix=Array.from({length:30},(_,start)=>[{end:start+1,density:start%3 ? .9 : .2}])
 const graph=[...prefix,[{end:31,density:.5},{end:32,density:.9}],[{end:33,density:.5}],[{end:33,density:.1}]]
 const options=[[...prefix.map((_,i)=>i+1),31,33],[...prefix.map((_,i)=>i+1),32,33]]
 const cost=(path:number[])=>{
  let start=0,sum=0,square=0
  for(const end of path){const r=1-graph[start]!.find(row=>row.end===end)!.density;sum+=r;square+=r*r;start=end}
  return 2*square-sum*sum/path.length
 }
 options.sort((a,b)=>cost(a)-cost(b))
 expect(planNativeLines(graph)).toEqual(options[0])
 expect(planNativeLines(graph,undefined,cost(options[0]!)-.01)).toBeUndefined()
})

it('refreshes reused candidate weights after callers edit a row',()=>{
 const graph:NativeLineCandidate[][]=[[{end:1,density:.8},{end:2,density:.4}],[{end:2,density:.8}]]
 expect(planNativeLines(graph)).toEqual([1,2])
 graph[0]![1]!.density=1
 expect(planNativeLines(graph)).toEqual([2])
 graph[0]![1]!.penalty=1
 expect(planNativeLines(graph)).toEqual([1,2])
})
