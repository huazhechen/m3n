import { expect, it } from 'vitest'
import { planNativeLines, type NativeLineCandidate } from './native-line-breaking.js'
import { greedyNativeLines, nativeLinePlanCost, planNativeLinesWithinPages } from './native-page-line-breaking.js'
import { planNativeLinesWithRefinedPages } from './native-refined-page-breaking.js'
import { prepareNativePagination, type NativePageBlock } from './native-pagination.js'

it('matches exact prefix search while learning only visited row geometry', () => {
  let seed = 1097, violations = 0
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  for (let trial = 0; trial < 120; trial++) {
    const count = 6 + trial % 2
    const graph: NativeLineCandidate[][] = Array.from({ length: count }, (_, start) =>
      Array.from({ length: Math.min(3, count - start) }, (_, index) => ({ end: start + index + 1, density: .25 + random() * .75 })))
    const exact = graph.map((rows, start) => new Map(rows.map(row => {
      const bottom = 10 + random() * 60
      return [row.end, { height: bottom, core: { top: 0, bottom: 10 },
        ink: [{ left: start % 2 * 2, right: start % 2 * 2 + 1, top: 0, bottom }], resolvedInk: true } satisfies NativePageBlock]
    })))
    const lower: NativePageBlock = { height: 10, core: { top: 0, bottom: 10 }, ink: [{ left: 0, right: 1, top: 0, bottom: 10 }], resolvedInk: false }
    const options = { pageHeight: 115, margin: 0, gap: 15, headerGap: 0,}
    const learned = new Map<string, NativePageBlock>()
    const evaluate = (ends: number[]) => {
      let start = 0
      const blocks = ends.map(end => {
        const block = exact[start]!.get(end)!
        learned.set(`${start}:${end}`, block); start = end; return block
      })
      return { ends, pages: prepareNativePagination(blocks, {})(options).heights.length, value: ends }
    }
    const greedy = evaluate(greedyNativeLines(graph)), optimum = evaluate(planNativeLines(graph))
    if (optimum.pages > greedy.pages) violations++
    const expected = planNativeLinesWithinPages(graph, greedy, optimum, evaluate)
    learned.clear()
    evaluate(greedy.ends); evaluate(optimum.ends)
    const actual = planNativeLinesWithRefinedPages(graph, greedy, optimum, evaluate, {
      options, headers: [], revision: () => learned.size,
      blockFor: (start, end) => learned.get(`${start}:${end}`) ?? lower,
    })
    expect(actual.ends, `trial ${trial}`).toEqual(expected.ends)
    expect(nativeLinePlanCost(graph, actual.ends)).toBeCloseTo(nativeLinePlanCost(graph, expected.ends), 12)
    expect(actual.pages).toBe(expected.pages)
  }
  expect(violations).toBeGreaterThan(10)
})
