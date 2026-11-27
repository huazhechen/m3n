import { planScoreLinesGlobally, type ScoreLineCandidate } from './line-breaking.js'
import { greedyScoreLines, planScoreLinesWithinPages, scoreLinePlanCost, improveFeasibleScoreLines } from './page-line-breaking.js'
import { planScoreLinesWithPageCost, createScorePageCostCache, type ScorePageCostOptions } from './page-cost-breaking.js'
import type { ScorePageBlock } from './geometry.js'

type Graph = readonly (readonly ScoreLineCandidate[])[]
type Measured<T> = { ends: number[]; pages: number; value: T }

/** A one-page optimum, identical plan, or certified page floor already proves
 * the greedy ceiling cannot invalidate the optimum. Otherwise measure it. */
export function measureScoreGreedyPageCeiling<T>(graph: Graph, optimum: Measured<T> | undefined,
  evaluate: (ends: number[]) => Measured<T>, floorFor?: (ends: number[]) => number): Measured<T> {
  const ends = greedyScoreLines(graph)
  if (optimum && (optimum.pages === 1 || ends.length === optimum.ends.length && ends.every((end, index) => end === optimum.ends[index])
    || floorFor && floorFor(ends) >= optimum.pages)) return optimum
  return evaluate(ends)
}
export type ScorePageCostModel = {
  blockFor: (start: number, end: number, previousStart?: number, reference?: number) => ScorePageBlock
  headers: readonly ScorePageBlock[]
  options: Omit<ScorePageCostOptions, 'ceiling' | 'maximumCost' | 'cache' | 'rowsToResolve' | 'reference'>
  reference?: () => ScorePageCostOptions['reference']
  restrict?: (graph: Graph) => void
  revision: () => number
  tighten?: (rows: ReadonlySet<string>) => void
}

/** Exact orchestration shared by both notation adapters. Geometry callbacks
 * supply optimistic blocks and learn immutable exact rows after evaluation.
 * A feasible optimistic optimum is a proof; otherwise refine then use disjoint
 * prefix search. Neither strategy drops candidates or quantizes geometry. */
export function planScoreLinesWithRefinedPages<T>(graph: Graph, greedy: Measured<T>, optimum: Measured<T>,
  evaluate: (ends: number[]) => { pages: number; value?: T }, model: ScorePageCostModel,
  timings?: Record<string, number>): Measured<T> {
  if (optimum.pages <= greedy.pages) return optimum
  if ((globalThis as {__m3nExperimentalGreedyCeiling?:boolean}).__m3nExperimentalGreedyCeiling) {
    const greedyCost=scoreLinePlanCost(graph,greedy.ends), optimumCost=scoreLinePlanCost(graph,optimum.ends)
    if ((globalThis as {__m3nTraceWidths?:boolean}).__m3nTraceWidths) console.log('fast-ceiling '+JSON.stringify({greedyCost,optimumCost,rows:greedy.ends.length}))
    if (greedyCost<=Math.max(.6,2*optimumCost)+1e-12) return greedy
  }
  const pageCache = createScorePageCostCache(), rowsToResolve = new Set<string>()
  const certifiedCosts = new WeakMap<object, number>(), unconstrainedCosts = new WeakMap<object, number>()
  const solveRestricted = (restricted: Graph, maximumCost: number, knownUnconstrained?: number[]) => {
    const started = timings ? performance.now() : 0
    const certified = certifiedCosts.get(restricted)
    if (certified !== undefined && certified > maximumCost + 1e-12) return undefined
    let unconstrainedCost = unconstrainedCosts.get(restricted)
    if (unconstrainedCost === undefined) {
      const unconstrained = knownUnconstrained ?? planScoreLinesGlobally(restricted, undefined, maximumCost)
      if (!unconstrained) {
        if (timings) timings.numericPageHorizontalPrunes = (timings.numericPageHorizontalPrunes ?? 0) + 1
        return undefined
      }
      unconstrainedCost = scoreLinePlanCost(restricted, unconstrained)
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
      result = planScoreLinesWithPageCost(restricted, model.blockFor, model.headers, {
        ...model.options, ceiling: greedy.pages, maximumCost: maximum,
        reference: model.reference?.(), cache: pageCache, rowsToResolve }, timings)
      certifiedCosts.set(restricted, Math.max(certifiedCosts.get(restricted) ?? 0,
        result ? scoreLinePlanCost(restricted, result) : maximum))
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
    const witness = solveRestricted(graph, scoreLinePlanCost(graph, greedy.ends))
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
  const feasible = improveFeasibleScoreLines(graph, greedy, evaluate, timings)
  if (timings) timings.numericBalanceMs = (timings.numericBalanceMs ?? 0) + performance.now() - started
  return planScoreLinesWithinPages(graph, greedy, optimum, evaluate, timings, undefined, () => feasible, solveRestricted)
}
