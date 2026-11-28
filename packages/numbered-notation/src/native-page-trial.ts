import type { NativeLayout } from './native-layout-model.js'
import type { NativeRowHorizontal, NativeRowSnapshot } from './native-row-cache.js'
import type { ScoreLineCandidate } from './layout/line-breaking.js'
import type { ScorePageBlock } from './layout/pagination.js'

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
  fixedPageFloor: () => number
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
  tierTotalCost: number
  tierCost: number
  systemCount: number
  ends: number[]
  candidates: ScoreLineCandidate[][]
  complete(cache?: NativePageTrialCache, pageLimit?: number, onlyRow?: number): NativeLayout
}
