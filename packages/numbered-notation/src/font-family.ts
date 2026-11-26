import { scoreLayoutConfig } from './score-layout-config.js'

/** Only these three families participate in score engraving. */
export const SCORE_TEXT_FONT: string = scoreLayoutConfig.fonts.text
export const SCORE_LATIN_FONT: string = scoreLayoutConfig.fonts.latin
export const SCORE_CJK_FONT: string = scoreLayoutConfig.fonts.cjk
export const SCORE_MUSIC_FONT: string = scoreLayoutConfig.fonts.music
export const SCORE_NUMBER_FONT: string = SCORE_LATIN_FONT
/** Western title glyphs use Barlow; CJK falls back to Noto Sans SC. */
export const SCORE_TITLE_FONT: string = scoreLayoutConfig.fonts.title
export const SCORE_TITLE_WEIGHT: number = scoreLayoutConfig.fonts.titleWeight
export const SCORE_TEXT_WEIGHT: number = scoreLayoutConfig.fonts.textWeight

/** Editor previews use the device's Chinese font even when reading fonts are installed. */
export function scoreFontFamily(family: string, systemCjk = false): string {
  return systemCjk ? family.replaceAll(SCORE_CJK_FONT, 'system-ui, sans-serif') : family
}

export function scoreSvgFontFamilies(svg: string, systemCjk = false): string {
  return systemCjk ? svg.replace(/font-family="([^"]*)"/g, (_attribute, family: string) =>
    `font-family="${scoreFontFamily(family, true)}"`) : svg
}
