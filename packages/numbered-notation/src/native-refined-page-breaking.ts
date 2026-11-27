import { planNativeLines, type NativeLineCandidate } from './native-line-breaking.js'
import { greedyNativeLines, planNativeLinesWithinPages, nativeLinePlanCost, improveFeasibleNativeLines } from './native-page-line-breaking.js'
import { planNativeLinesWithPageCost, createNativePageCostCache, type NativePageCostOptions } from './native-page-cost-breaking.js'
import type { NativePageBlock } from './native-pagination.js'

type Graph = readonly (readonly NativeLineCandidate[])[]
type Measured<T> = { ends: number[]; pages: number; value: T }

/** A one-page optimum, identical plan, or certified page floor already proves
 * the greedy ceiling cannot invalidate the optimum. Otherwise measure it. */
export function measureNativeGreedyPageCeiling<T>(graph: Graph, optimum: Measured<T> | undefined,
  evaluate: (ends: number[]) => Measured<T>, floorFor?: (ends: number[]) => number): Measured<T> {
  const ends = greedyNativeLines(graph)
  if (optimum && (optimum.pages === 1 || ends.length === optimum.ends.length && ends.every((end, index) => end === optimum.ends[index])
    || floorFor && floorFor(ends) >= optimum.pages)) return optimum
  return evaluate(ends)
}
export type NativePageCostModel = {
  blockFor: (start: number, end: number, previousStart?: number, reference?: number) => NativePageBlock
  headers: readonly NativePageBlock[]
  options: Omit<NativePageCostOptions, 'ceiling' | 'maximumCost' | 'cache' | 'rowsToResolve' | 'reference'>
  reference?: () => NativePageCostOptions['reference']
  restrict?: (graph: Graph) => void
  revision: () => number
  tighten?: (rows: ReadonlySet<string>) => void
}

/** Exact orchestration shared by both notation adapters. Geometry callbacks
 * supply optimistic blocks and learn immutable exact rows after evaluation.
 * A feasible optimistic optimum is a proof; otherwise refine then use disjoint
 * prefix search. Neither strategy drops candidates or quantizes geometry. */
export function planNativeLinesWithRefinedPages<T>(graph: Graph, greedy: Measured<T>, optimum: Measured<T>,
  evaluate: (ends: number[]) => { pages: number; value?: T }, model: NativePageCostModel,
  timings?: Record<string, number>): Measured<T> {
  if (optimum.pages <= greedy.pages) return optimum
  const pageCache = createNativePageCostCache(), rowsToResolve = new Set<string>()
  const certifiedCosts = new WeakMap<object, number>(), unconstrainedCosts = new WeakMap<object, number>()
  const solveRestricted = (restricted: Graph, maximumCost: number, knownUnconstrained?: number[]) => {
    const started = timings ? performance.now() : 0
    const certified = certifiedCosts.get(restricted)
    if (certified !== undefined && certified > maximumCost + 1e-12) return undefined
    let unconstrainedCost = unconstrainedCosts.get(restricted)
    if (unconstrainedCost === undefined) {
      const unconstrained = knownUnconstrained ?? planNativeLines(restricted, undefined, maximumCost)
      if (!unconstrained) {
        if (timings) timings.numericPageHorizontalPrunes = (timings.numericPageHorizontalPrunes ?? 0) + 1
        return undefined
      }
      unconstrainedCost = nativeLinePlanCost(restricted, unconstrained)
      unconstrainedCosts.set(restricted, unconstrainedCost)
    }
    if (unconstrainedCost > maximumCost + 1e-12) {
      if (timings) timings.numericPageHorizontalPrunes = (timings.numericPageHorizontalPrunes ?? 0) + 1
      return undefined
    }
    model.restrict?.(restricted)
    let maximum = Math.min(maximumCost, Math.max(unconstrainedCost, certified === undefined ? 0 : certified + .05))
    let result: number[] | undefined, step = .05
    for (;;) {
      result = planNativeLinesWithPageCost(restricted, model.blockFor, model.headers, {
        ...model.options, ceiling: greedy.pages, maximumCost: maximum,
        reference: model.reference?.(), cache: pageCache, rowsToResolve }, timings)
      certifiedCosts.set(restricted, Math.max(certifiedCosts.get(restricted) ?? 0,
        result ? nativeLinePlanCost(restricted, result) : maximum))
      if (result || maximum >= maximumCost) break
      // Grow from the certified optimum, rather than multiplying the whole
      // score cost: long scores otherwise admit thousands of irrelevant states.
      maximum = Math.min(maximumCost, maximum + step)
      step *= 2
    }
    if (timings) timings.numericPageCostMs = (timings.numericPageCostMs ?? 0) + performance.now() - started
    return result
  }
  for (;;) {
    const revision = model.revision()
    rowsToResolve.clear()
    const witness = solveRestricted(graph, nativeLinePlanCost(graph, greedy.ends))
    if (!witness) throw new Error('Numerical page lower bound rejected the known feasible greedy plan')
    const measured = evaluate(witness)
    if (measured.pages <= greedy.pages) {
      if (measured.value === undefined) throw new Error('分页可行方案缺少雕版结果。')
      return { ends: witness, pages: measured.pages, value: measured.value }
    }
    model.tighten?.(rowsToResolve)
    if (model.revision() === revision) break
  }
  const started = timings ? performance.now() : 0
  const feasible = improveFeasibleNativeLines(graph, greedy, evaluate, timings)
  if (timings) timings.numericBalanceMs = (timings.numericBalanceMs ?? 0) + performance.now() - started
  return planNativeLinesWithinPages(graph, greedy, optimum, evaluate, timings, undefined, () => feasible, solveRestricted)
}
