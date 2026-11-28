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
