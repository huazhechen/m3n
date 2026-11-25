import type { TextMeasurer } from './native-measure.js'
import { bravuraSvg } from './bravura.js'
import { nativeStyle } from './native-style.js'
export function nativeArticulationSvg(name: string, size?: number, measurer?: TextMeasurer): string | undefined {
  if (name === 'str') return bravuraSvg('articAccentAbove', (size ?? nativeStyle.small) * .5, measurer)
  if (name === 'breath') return bravuraSvg('breathMarkComma', size ?? nativeStyle.breath, measurer)
  return undefined
}
