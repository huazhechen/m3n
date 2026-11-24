import type { TextMeasurer } from './native-measure.js'
import { bravuraSvg } from './bravura.js'
import { nativeStyle } from './native-style.js'
export function nativeOrnamentSvg(name: string, size = nativeStyle.small, measurer?: TextMeasurer): string | undefined {
  if (name === 'tr') return bravuraSvg('ornamentTrill', size, measurer)
  if (name === 'prall') return bravuraSvg('ornamentShortTrill', size * .55, measurer)
  return undefined
}
