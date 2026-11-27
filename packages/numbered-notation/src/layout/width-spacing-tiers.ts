import { scoreWidthPolicyState } from './width-candidate-policy.js'
/** Candidate surrogate: choose one provisional clearance tier when opted in.
 * Exact verification disables row reuse and retains every spacing trial. */
export function scoreCandidateSpacingTiers<T>(tiers:readonly T[],equalMeasures:boolean):readonly T[] {
  const experiment=scoreWidthPolicyState()
  return experiment.__m3nExperimentalRowReuse && (experiment.__m3nExperimentalSingleTier || equalMeasures && experiment.__m3nExperimentalEqualTier)
    ? tiers.slice(0,1) : tiers
}
