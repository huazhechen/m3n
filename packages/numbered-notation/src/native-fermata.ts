import type { TextMeasurer } from './native-measure.js'
import { bravuraSvg } from './bravura.js'
import { nativeStyle } from './native-style.js'
export const nativeFermataSvg = (size = nativeStyle.small, measurer?: TextMeasurer) => bravuraSvg('fermataAbove', size * .6, measurer)
