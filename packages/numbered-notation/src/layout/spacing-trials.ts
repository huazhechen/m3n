/** Ranking is shared by both adapters: paper use, physical spacing cost,
 * then the looser minimum spacing. Width-level font cost is constant here.
 */
export type ScoreSpacingTrial = { pages: number; cost: number; spacing: number }

export function compareScoreSpacingTrials(a: ScoreSpacingTrial, b: ScoreSpacingTrial): number {
  if (a.pages !== b.pages) return a.pages < b.pages ? -1 : 1
  if (a.cost !== b.cost) return a.cost < b.cost ? -1 : 1
  return b.spacing - a.spacing
}
