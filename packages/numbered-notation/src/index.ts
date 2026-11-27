export { NativeNumberedNotationScore as NumberedNotationScore } from './native-score.js'
export { numberedLayoutQuality } from './native-score.js'
export type { NumberedNotationRenderOptions } from './native-score.js'
export { prepareNumberedNotationFonts, registerScoreFontBundle } from './fonts.js'
export type { NativeDiagnostic as NumberedNotationDiagnostic } from './native-model.js'
export { renderSharedNumberedNotationScores } from './native-score.js'
export { PreparedNumberedNotationScore, renderSharedPreparedNumberedNotationScores } from './native-score.js'

export * from './font-family.js'
export { scoreFontText, scoreCjkFont, scoreFontForCharacter, loadScoreFont } from './fonts.js'
export type { ScoreFontResource } from './fonts.js'
export { NumberedTextMeasurementCache } from './native-measure.js'
export { NativeLayoutTask as NumberedLayoutTask } from './native-layout.js'

export { sortedNativeInkSeparation as sortedInkSeparation } from './native-ink-separation.js'

export { lyricSpacing, hasLyricHyphen, connectsLyricWord, lyricHyphenMetrics, lyricHyphenGeometry, lyricHyphenAdvance } from './lyric-spacing.js'

export { scoreLayoutConfig } from './score-layout-config.js'
export { lastLineWidth } from './last-line-width.js'

export { scoreLineQuality, scoreHorizontalQuality } from './layout-quality.js'
export { solveNativeSpacing as solveScoreSpacing } from './native-spacing.js'
export { fitSpacingSprings } from './native-spacing.js'
export { scoreReadingWindows, type ReadingPoint } from './reading-density.js'
export { balanceScorePageTail } from './page-tail.js'

export { scoreSpacingBasis, scoreNaturalAdvance, scoreRhythmicWeight, scoreAttachmentHeight, scoreNavigationGlyphHeight, scoreCoreGap, scoreMaximumCoreGap, scoreLyricGapScale, interpolateScoreCoreGap } from './score-layout-policy.js'

export { nativeDynamicGlyph as scoreDynamicGlyph } from './native-dynamics.js'

export type { LyricWordSyllable } from './lyric-spacing.js'

export { inheritElasticWidth, elasticLineBadness, solveElasticSprings, type SpacingSpring, type ElasticSpacing } from './elastic-spacing.js'

// Notation-independent solvers shared by the numbered and staff adapters.
export { planNativeLines as planScoreLinesGlobally, type NativeLineCandidate as ScoreLineCandidate } from './native-line-breaking.js'
export { greedyNativeLines as greedyScoreLines, planNativeLinesWithinPages as planScoreLinesWithinPages } from './native-page-line-breaking.js'
export { nativePageFeasibility as scorePageFeasibility } from './native-height-feasibility.js'
export { prepareNativePagination as prepareScorePagination, type NativePageBlock as ScorePageBlock } from './native-pagination.js'
export { nativeHeightEnvelope as scoreHeightEnvelope, mergeNativeHeightEnvelopes as mergeScoreHeightEnvelopes, nativeEnvelopeBlock as scoreEnvelopeBlock, type NativeHeightEnvelope as ScoreHeightEnvelope } from './native-height-envelope.js'
export { scoreNumberedSpacing as scorePhysicalSpacing, scoreNumberedCost as scoreLayoutCosts } from './layout-quality.js'

export { planNativeLinesWithRefinedPages as planScoreLinesWithRefinedPages, measureNativeGreedyPageCeiling as measureScoreGreedyPageCeiling, type NativePageCostModel as ScorePageCostModel } from './native-refined-page-breaking.js'

export { nativePageCollision as scorePageCollision, nativePageDistance as scorePageDistance } from './native-page-collision.js'
