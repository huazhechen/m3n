import { scoreLayoutConfig } from './score-layout-config.js'

/** Only these three families participate in score engraving. */
export const SCORE_TEXT_FONT: string = scoreLayoutConfig.fonts.text
export const SCORE_LATIN_FONT: string = scoreLayoutConfig.fonts.latin
export const SCORE_CJK_FONT: string = scoreLayoutConfig.fonts.cjk
export const SCORE_MUSIC_FONT: string = scoreLayoutConfig.fonts.music
export const SCORE_NUMBER_FONT: string = scoreLayoutConfig.fonts.numbers
/** Normal-width title glyphs; use the installed regular face without faux bold. */
export const SCORE_TITLE_FONT: string = scoreLayoutConfig.fonts.title
export const SCORE_TITLE_WEIGHT: number = scoreLayoutConfig.fonts.titleWeight
export const SCORE_TEXT_WEIGHT: number = scoreLayoutConfig.fonts.textWeight
