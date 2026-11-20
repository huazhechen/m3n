import { bravuraSvg } from './bravura.js'
import { nativeStyle } from './native-style.js'
export const nativeFermataSvg = (size = nativeStyle.small) => bravuraSvg('fermataAbove', size * .6)
