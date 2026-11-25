import { NUMBER_FONT_CSS } from './font-data.js'
import { SCORE_NUMBER_FONT } from './font-family.js'

/** Keep embedded font bytes unchanged; the installed and standalone SVG alias
 * must both follow the score font configuration. */
export const numberFontCss = NUMBER_FONT_CSS.replace(/font-family:\s*'[^']*'/, () => `font-family: '${SCORE_NUMBER_FONT}'`)
