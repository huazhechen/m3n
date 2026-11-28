/** Search estimates are private to one synchronous numeric measurement.
 * Final engraving and unrelated concurrent requests keep their own policy. */
export type ScoreWidthCandidatePolicy = Readonly<{
  rowReuse?: boolean
  greedyCeiling?: boolean
  inkBin?: number
  widthBin?: number
  pageCostPasses?: number
  crossTier?: boolean
  singleTier?: boolean
  equalTier?: boolean
  endpointFloor?: boolean
}>

/** Production candidates use complete geometry and every spacing tier. */
export const exactScoreWidthPolicy:ScoreWidthCandidatePolicy=Object.freeze({})
/** Compatibility name for callers that request the production policy. */
export const optimizedScoreWidthPolicy = exactScoreWidthPolicy

const flags=[
  ['rowReuse','__m3nExperimentalRowReuse',false],
  ['greedyCeiling','__m3nExperimentalGreedyCeiling',false],
  ['inkBin','__m3nExperimentalInkBin',0],
  ['widthBin','__m3nExperimentalWidthBin',0],
  ['pageCostPasses','__m3nExperimentalPageCostPasses',0],
  ['crossTier','__m3nExperimentalTierReuse',false],
  ['singleTier','__m3nExperimentalSingleTier',false],
  ['equalTier','__m3nExperimentalEqualTier',false],
  ['endpointFloor','__m3nExperimentalEndpointFloor',false],
] as const

type PolicyState={ [Entry in typeof flags[number] as Entry[1]]?:ScoreWidthCandidatePolicy[Entry[0]] }
const compiledPolicies=new WeakMap<ScoreWidthCandidatePolicy,PolicyState>()
let activePolicy:PolicyState|undefined

/** Legacy flags remain available to isolated benchmark experiments. Production
 * measurements read a private context and never change browser globals. */
export function scoreWidthPolicyState():PolicyState {
  return activePolicy ?? globalThis as unknown as PolicyState
}

/** Fonts may await before entering this synchronous geometry scope. */
export function withScoreWidthCandidatePolicy<T>(policy:ScoreWidthCandidatePolicy|undefined,measure:()=>T):T {
  if(policy===undefined)return measure()
  let compiled=compiledPolicies.get(policy)
  if(!compiled) {
    const values:Record<string,unknown>={}
    for(const [field,key,fallback] of flags)values[key]=policy[field] ?? fallback
    compiled=values as PolicyState
    compiledPolicies.set(policy,compiled)
  }
  const previous=activePolicy
  activePolicy=compiled
  try {
    const result=measure()
    if(result && typeof (result as {then?:unknown}).then==='function')throw new Error('Width candidate policy scope must be synchronous')
    return result
  } finally { activePolicy=previous }
}
