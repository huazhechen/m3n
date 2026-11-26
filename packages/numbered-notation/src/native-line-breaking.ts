import { planScoreLines, type LineCandidate } from '@m3n/notation'

export type NativeLineCandidate = LineCandidate

/** Numbered notation compares elastic strain, without a per-row charge.
 * Keep the staff renderer's legacy row-cost option out of this API. */
export function planNativeLines(candidates: readonly (readonly NativeLineCandidate[])[]): number[] {
  return planScoreLines(candidates, { rowCost: 0 })
}
