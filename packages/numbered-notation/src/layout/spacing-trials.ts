import type { ScoreWidthCandidateBound } from './width-candidate-policy.js'
import { scorePageCost } from './quality.js'

/** Ranking is shared by both adapters: combined paper and physical spacing cost,
 * then the looser minimum spacing. Width-level font cost is constant here.
 */
export type ScoreSpacingTrial = { pages: number; cost: number; spacing: number }

export function compareScoreSpacingTrials(a: ScoreSpacingTrial, b: ScoreSpacingTrial): number {
  const aCost = a.cost + scorePageCost(a.pages), bCost = b.cost + scorePageCost(b.pages)
  if (aCost !== bCost) return aCost < bCost ? -1 : 1
  return b.spacing - a.spacing
}


/** Vertical cost is nonnegative. The first prefix whose paper plus horizontal
 * cost loses cannot become a winning complete trial by adding more rows. */
export function scoreSpacingTrialPageCeiling(cost: number, spacing: number, incumbent: ScoreSpacingTrial | undefined, maximum: number): number | undefined {
  if (!incumbent || !Number.isFinite(incumbent.pages) || !Number.isFinite(incumbent.cost)) return undefined
  for (let pages = 1; pages <= maximum; pages++)
    if (compareScoreSpacingTrials({ pages, cost, spacing }, incumbent) >= 0) return pages - 1
  return undefined
}

/** Match width ranking's reciprocal and narrower-width tie order exactly. */
export function scoreWidthCandidateCanWin(width: number, totalCost: number, pages: number, bound?: ScoreWidthCandidateBound): boolean {
  if (!bound || !Number.isFinite(bound.quality)) return true
  const quality = 1 / (1 + totalCost + scorePageCost(pages))
  return quality > bound.quality || quality === bound.quality && width < bound.width
}

export function scoreWidthCandidatePageCeiling(width: number, totalCost: number, maximum: number, bound?: ScoreWidthCandidateBound): number | undefined {
  if (!bound || !Number.isFinite(bound.quality) || bound.quality <= 0) return undefined
  const scale = Math.max(1, Math.abs(totalCost), 1 / bound.quality)
  if (!Number.isFinite(scale)) return undefined
  // Leave room for the different addition order of tier and width costs.
  // This only weakens pruning; final width ranking remains unchanged.
  const lowerCost = totalCost - 32 * Number.EPSILON * scale
  for (let pages = 1; pages <= maximum; pages++)
    if (!scoreWidthCandidateCanWin(width, lowerCost, pages, bound)) return pages - 1
  return undefined
}
