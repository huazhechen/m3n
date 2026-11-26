import { expect, it } from 'vitest'
import { planNativeLines, type NativeLineCandidate } from './native-line-breaking.js'
import { greedyNativeLines, nativeLinePlanCost, planNativeLinesWithinPages } from './native-page-line-breaking.js'

function graphFor(widths: number[]): NativeLineCandidate[][] {
  return widths.map((_, start) => {
    const result: NativeLineCandidate[] = []
    let width = 0
    for (let end = start; end < widths.length; end++) {
      width += widths[end]!
      if (width > 100 && end > start) break
      result.push({ end: end + 1, density: width / 100 })
    }
    return result
  })
}
function enumerate(graph: NativeLineCandidate[][], start = 0): number[][] {
  return start === graph.length ? [[]] : graph[start]!.flatMap(row => enumerate(graph, row.end).map(rest => [row.end, ...rest]))
}
function independentCost(graph: NativeLineCandidate[][], ends: number[]) {
  let start = 0
  const stretch = ends.map(end => {
    const row = graph[start]!.find(row => row.end === end)!
    start = end
    return Math.max(0, 1 - row.density)
  })
  const mean = stretch.reduce((s, r) => s + r, 0) / stretch.length
  return stretch.reduce((s, r) => s + r * r + (r - mean) ** 2, 0)
}

it('retains the unconstrained optimum without additional pagination when it fits the measured ceiling', () => {
  const graph = graphFor([30, 30, 40, 40, 40, 40])
  const greedy = { ends: greedyNativeLines(graph), pages: 2, value: 'greedy' }
  const optimum = { ends: planNativeLines(graph), pages: 1, value: 'optimum' }
  expect(planNativeLinesWithinPages(graph, greedy, optimum, () => { throw new Error('Unneeded pagination') })).toBe(optimum)
})

it('matches exhaustive feasible partitions with height-sensitive page predicates, including equal-row alternatives', () => {
  let seed = 17, rejected = 0
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  for (let trial = 0; trial < 150; trial++) {
    const graph = graphFor(Array.from({ length: 5 + trial % 6 }, () => 15 + Math.floor(random() * 45)))
    // Independent page oracle: equal row counts may have different page use.
    const pages = (ends: number[]) => 1 + ends.reduce((s, end, i) => s + end * (i + 3), trial) % 3
    const greedyEnds = greedyNativeLines(graph), optimumEnds = planNativeLines(graph)
    const ceiling = pages(greedyEnds)
    const measured = (ends: number[]) => ({ ends, pages: pages(ends), value: ends })
    if (pages(optimumEnds) > ceiling) rejected++
    const result = planNativeLinesWithinPages(graph, measured(greedyEnds), measured(optimumEnds), measured)
    expect(result.pages).toBeLessThanOrEqual(ceiling)
    const feasible = enumerate(graph).filter(ends => pages(ends) <= ceiling)
    expect(independentCost(graph, result.ends)).toBeCloseTo(Math.min(...feasible.map(ends => independentCost(graph, ends))), 11)
    expect(nativeLinePlanCost(graph, result.ends)).toBeCloseTo(independentCost(graph, result.ends), 12)
  }
  expect(rejected).toBeGreaterThan(10)
})

it('preserves forced breaks and unavoidable oversized measures in the greedy seed', () => {
  const graph = graphFor([40, 40, 40, 40, 40])
  for (let at = 0; at < 3; at++) graph[at] = graph[at]!.filter(row => row.end <= 3)
  expect(greedyNativeLines(graph)).toEqual([2, 3, 5])
  expect(greedyNativeLines(graphFor([120, 30, 30]))).toEqual([1, 3])
  expect(greedyNativeLines([])).toEqual([])
})
