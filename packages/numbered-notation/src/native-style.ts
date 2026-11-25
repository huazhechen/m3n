import { nativeSvgNumber as n } from './native-svg-number.js'
import { scoreLayoutConfig } from './score-layout-config.js'

/** Internal shorthand; edit score-layout-config.ts to change engraving settings. */
export const nativeStyle = scoreLayoutConfig.numbered

export function nativeDesignPath(d: string): string {
  return d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g, value => String(n(Number(value))))
}
