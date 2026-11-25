import { NUMBER_FONT_CSS } from './font-data.js'
import { SCORE_NUMBER_FONT } from './font-family.js'

/** Standalone SVGs embed the original face under the same family as Canvas. */
export const numberFontCss = NUMBER_FONT_CSS.replace(/font-family:\s*'[^']*'/, () => `font-family: '${SCORE_NUMBER_FONT}'`)
