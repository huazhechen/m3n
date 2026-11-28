import type { ScoreLineCandidate } from './line-breaking.js'

/** Exact shortest path for one horizontal tier. Every row uses the same cost;
 * no musical geometry is approximated. */
export function planScoreTier(candidates: readonly (readonly ScoreLineCandidate[])[],
  densityTarget: number): number[] | undefined {
  const cost = Array<number>(candidates.length + 1).fill(Infinity)
  const next = Array<number>(candidates.length).fill(-1)
  cost[candidates.length] = 0
  for (let start = candidates.length - 1; start >= 0; start--) for (const row of candidates[start]!) {
    const slack = Math.max(0, 1 - row.density)
    const deficit = Math.max(0, 1 - row.density / densityTarget)
    const value = slack * slack + deficit * deficit + (row.penalty ?? 0) + 100 * Math.max(0, row.density - 1) ** 2 + cost[row.end]!
    if (value < cost[start]! - 1e-12 || Number.isFinite(value) && Math.abs(value - cost[start]!) <= 1e-12 && row.end > next[start]!) {
      cost[start] = value; next[start] = row.end
    }
  }
  if (!Number.isFinite(cost[0])) return undefined
  const ends: number[] = []
  for (let start = 0; start < candidates.length;) { start = next[start]!; ends.push(start) }
  return ends
}
/** The widest candidate is also the relaxed occupancy fallback. */
export const scoreTierDensityTarget = (spacing: number, tiers: readonly number[]): number => spacing === tiers.at(-1) ? .5 : 2/3
