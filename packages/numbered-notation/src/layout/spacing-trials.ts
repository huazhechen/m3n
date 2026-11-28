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
