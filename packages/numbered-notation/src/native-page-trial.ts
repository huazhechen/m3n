import { A4_CONTENT_ASPECT_RATIO, type ScoreDocument } from '@m3n/notation'
import { nativeCoreGap } from './native-style.js'
import type { NativeRenderOptions, NativeLayout } from './native-layout-model.js'
import type { NativeRowHorizontal, NativeRowSnapshot } from './native-row-cache.js'
import type { ScoreLineCandidate } from './layout/line-breaking.js'
import type { ScorePageBlock } from './layout/pagination.js'
import { greedyScoreLines, planScoreLinesWithinPages } from './layout/page-line-breaking.js'
import { planScoreLinesWithRefinedPages, measureScoreGreedyPageCeiling } from './layout/refined-page-breaking.js'

/** Numbered geometry adapter: memoize exact plans, expose safe row bounds,
 * and delegate all refinement and fallback search to the shared solver.
 */
export type NativePageTrialCache = {
  horizontal?: Map<string, NativeRowHorizontal>
  endingPairs?: Map<string, Map<number, { full: ScorePageBlock; inherited: ScorePageBlock; lower: ScorePageBlock }>>
  endingInherited?: Map<string, ScorePageBlock>
  fullRows?: Map<string, { gap: number; block: ScorePageBlock }>
  coreBounds?: Map<string, ScorePageBlock>
  coreRevision?: number
  rows?: Map<string, NativeRowSnapshot>
  blocks: Map<string, ScorePageBlock>
  headers?: ScorePageBlock[]
}

export type NativeGapTrial = {
  canFitPageCeiling?: (ceiling: number) => boolean
  readonly pageFloor: number
  pageFloorFor?: (ends: readonly number[], headers: readonly ScorePageBlock[]) => number
  readonly endingReference?: {
    required?: (at: number) => boolean
    section: (at: number) => number
    gap: (start: number, end: number) => number | undefined
    terminal: (start: number, end: number) => boolean
  }
  restrictBounds?: (graph: readonly (readonly ScoreLineCandidate[])[]) => void
  tightenRowBounds?: (cache: NativePageTrialCache, rows?: ReadonlySet<string>) => void
  coreLowerBound?: (start: number, end: number, cache?: NativePageTrialCache, previousStart?: number, reference?: number) => ScorePageBlock
  score: number
  tierCost: number
  systemCount: number
  ends: number[]
  candidates: ScoreLineCandidate[][]
  complete(cache?: NativePageTrialCache, pageLimit?: number, onlyRow?: number): NativeLayout
}

export function completePageConstrainedTrial(document: ScoreDocument, supplied: NativeRenderOptions, trial: NativeGapTrial,
  preparePlan: (ends: number[]) => NativeGapTrial, timings?: Record<string, number>): NativeLayout {
  const rowCache: NativePageTrialCache | undefined = supplied.cachePageLineGeometry === false ? undefined : { blocks: new Map() }
  const greedyEnds = greedyScoreLines(trial.candidates)
  if (greedyEnds.length === trial.ends.length && greedyEnds.every((end, index) => end === trial.ends[index])) {
    if (timings) timings.pageBoundIdenticalPlans = (timings.pageBoundIdenticalPlans ?? 0) + 1
    return trial.complete()
  }
  const plans = new Map<string, { ends: number[]; pages: number; value: NativeLayout }>()
  let exactPageCeiling: number | undefined
  const measure = (ends: number[]) => {
    const key = ends.join(':')
    const cached = plans.get(key)
    if (cached) { if (timings) timings.numericPlanCacheHits = (timings.numericPlanCacheHits ?? 0) + 1; return cached }
    const value = preparePlan(ends).complete(rowCache, exactPageCeiling)
    const measured = { ends, pages: value.pages.length, value }
    if (plans.size < 2) plans.set(key, measured)
    return measured
  }
  let optimumValue: NativeLayout | undefined
  try { optimumValue=trial.complete(rowCache) }
  catch(error){if(!(error instanceof Error && error.message.includes('单个谱行')))throw error}
  if(optimumValue)plans.set(trial.ends.join(':'),{ends:trial.ends,pages:optimumValue.pages.length,value:optimumValue})
  const started = timings ? performance.now() : 0
  let greedy: ReturnType<typeof measure>
  try {
    greedy = measureScoreGreedyPageCeiling(trial.candidates,
      optimumValue ? { ends: trial.ends, pages: optimumValue.pages.length, value: optimumValue } : undefined, measure,
      optimumValue && trial.pageFloorFor ? ends => {
        const since = timings ? performance.now() : 0
        const floor = trial.pageFloorFor!(ends, optimumValue!.verticalBlocks.slice(0, optimumValue!.headerBlocks.length))
        if (timings) {
          timings.greedyPageFloorMs = (timings.greedyPageFloorMs ?? 0) + performance.now() - since
          if (floor >= optimumValue!.pages.length) timings.greedyPageFloorPrunes = (timings.greedyPageFloorPrunes ?? 0) + 1
        }
        return floor
      } : undefined)
  } catch (error) {
    if (error instanceof Error && error.message.includes('单个谱行')) return trial.complete(rowCache)
    throw error
  }
  if (timings) timings.pageBoundGreedyMs = (timings.pageBoundGreedyMs ?? 0) + performance.now() - started
  const optimum={ends:trial.ends,pages:optimumValue?.pages.length ?? Infinity,value:optimumValue ?? greedy.value}
  if (timings && optimum.pages > greedy.pages) timings.pageBoundViolations = (timings.pageBoundViolations ?? 0) + 1
  if ((globalThis as {__m3nTraceWidths?:boolean}).__m3nTraceWidths)
    console.log('numeric-tier '+JSON.stringify({width:supplied.width,gap:supplied.minimumNoteGap,greedy:[greedy.pages,greedy.ends.length],optimum:[optimum.pages,optimum.ends.length]}))
  if (optimum.pages <= greedy.pages) return optimum.value
  exactPageCeiling = greedy.pages
  const evaluate = (ends: number[]) => {
    try {
      const measured = measure(ends)
      return { pages: measured.pages, value: measured.value }
    } catch (error) {
      const rejected = error as Error & { code?: string; pageCount?: number }
      if (rejected.code === 'M3N_PAGE_BOUND_REJECTED') return { pages: rejected.pageCount! }
      if (error instanceof Error && error.message.includes('单个谱行')) return { pages: Infinity }
      throw error
    }
  }
  if (supplied.numericLayout && trial.coreLowerBound) return planScoreLinesWithRefinedPages(trial.candidates, greedy, optimum, evaluate, {
    blockFor: (start, end, previousStart, reference) => trial.coreLowerBound!(start, end, rowCache, previousStart, reference),
    headers: greedy.value.verticalBlocks.slice(0, greedy.value.headerBlocks.length),
    options: { pageHeight: Math.floor(supplied.width * A4_CONTENT_ASPECT_RATIO), margin: greedy.value.margin,
      gap: nativeCoreGap(document), headerGap: nativeCoreGap(document) * .8,},
    reference: () => trial.endingReference,
    restrict: trial.restrictBounds,
    revision: () => rowCache?.coreRevision ?? 0,
    tighten: rows => { if (rowCache) trial.tightenRowBounds?.(rowCache, rows) },
  }, timings).value
  return planScoreLinesWithinPages(trial.candidates, greedy, optimum, evaluate, timings).value
}

