export { NativeNumberedNotationScore as NumberedNotationScore } from './native-score.js'
export { numberedLayoutQuality } from './native-score.js'
export type { NumberedNotationRenderOptions } from './native-score.js'
export { prepareNumberedNotationFonts, registerScoreFontBundle } from './fonts.js'
export { fontDesignGlyphPath } from './font-design-path.js'
export { fontDesignMeasurer } from './font-design.js'
export type { NativeDiagnostic as NumberedNotationDiagnostic } from './native-model.js'
export { renderSharedNumberedNotationScores } from './native-score.js'
export { PreparedNumberedNotationScore, renderSharedPreparedNumberedNotationScores } from './native-score.js'

export * from './font-family.js'
export { scoreFontText, scoreCjkFont, scoreFontForCharacter, loadScoreFont } from './fonts.js'
export type { ScoreFontResource } from './fonts.js'
export { NumberedTextMeasurementCache } from './native-measure.js'
export { NativeLayoutTask as NumberedLayoutTask } from './native-layout.js'

export { lyricSpacing, hasLyricHyphen, connectsLyricWord, lyricHyphenMetrics, lyricHyphenGeometry, lyricHyphenAdvance } from './lyric-spacing.js'

export { nativeDynamicGlyph as scoreDynamicGlyph } from './native-dynamics.js'

export type { LyricWordSyllable } from './lyric-spacing.js'

// Compatibility exports; new adapters use @m3n/numbered-notation/layout.
export * from './layout/index.js'
