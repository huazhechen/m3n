/** Equal-measure candidate surrogate: choose one provisional clearance tier.
 * Exact verification disables row reuse and retains every spacing trial. */
export function scoreCandidateSpacingTiers<T>(tiers:readonly T[],equalMeasures:boolean):readonly T[] {
  const experiment=globalThis as {__m3nExperimentalRowReuse?:boolean;__m3nExperimentalEqualTier?:boolean}
  return equalMeasures && experiment.__m3nExperimentalRowReuse && experiment.__m3nExperimentalEqualTier
    ? tiers.slice(0,1) : tiers
}
