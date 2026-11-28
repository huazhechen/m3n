/** Notation-independent layout contracts and exact solvers.
 * Adapters supply musical widths, safe bounds and exact measured row geometry.
 */
export { planScoreLinesGlobally, type ScoreLineCandidate } from './line-breaking.js'
export { greedyScoreLines, planScoreLinesWithinPages } from './page-line-breaking.js'
export { scorePageFeasibility } from './height-feasibility.js'
export { scoreCandidateSpacingTiers } from './width-spacing-tiers.js'
export { proxyScoreWidthInk, proxyScoreWidthPartition, proxyScoreWidthBounds, scoreWidthProxyKey } from './width-geometry-proxy.js'
export { prepareScorePagination, fitSharedScorePage, type ScorePageBlock } from './pagination.js'
export { scoreHeightEnvelope, mergeScoreHeightEnvelopes, scoreEnvelopeBlock, type ScoreHeightEnvelope } from './height-envelope.js'
export { planScoreLinesWithRefinedPages, measureScoreGreedyPageCeiling, type ScorePageCostModel } from './refined-page-breaking.js'
export { scorePageCollision, scorePageDistance } from './page-collision.js'
export { sortedScoreInkSeparation as sortedInkSeparation } from './ink-separation.js'
export type { ScoreInk } from './geometry.js'
export { compareScoreSpacingTrials, scoreSpacingTrialPageCeiling, type ScoreSpacingTrial } from './spacing-trials.js'

export { scoreLayoutConfig } from '../score-layout-config.js'
export * from './policy.js'
export { lastLineWidth } from './last-line-width.js'
export { scoreLineQuality, scoreHorizontalQuality, scoreNumberedSpacing as scorePhysicalSpacing, scoreNumberedCost as scoreLayoutCosts } from './quality.js'
export { solveScoreSpacing, fitSpacingSprings } from './spacing.js'
export { scoreReadingWindows, type ReadingPoint } from './reading-density.js'
export { inheritElasticWidth, elasticLineBadness, solveElasticSprings, type SpacingSpring, type ElasticSpacing } from './elastic-spacing.js'
export { balanceScorePageTail } from './page-tail.js'

export { optimizedScoreWidthPolicy, exactScoreWidthPolicy, withScoreWidthCandidatePolicy, scoreWidthPolicyState, type ScoreWidthCandidatePolicy } from './width-candidate-policy.js'

export { planScoreTier, scoreTierDensityTarget } from './tier-breaking.js'
