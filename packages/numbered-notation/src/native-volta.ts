import { nativeStyle } from './native-style.js'
import { NativeSymbols, line } from './native-symbols.js'
import type { TextMeasurer } from './native-measure.js'

/** Hooks and label are designed in the music font's grid, measured together. */
export function nativeVoltaSvg(left: number, right: number, ending: string, measurer: TextMeasurer): string {
  const size = nativeStyle.music, hook = size * (6 / 22), labelSize = size * (12 / 22)
  return line(left, hook, left, 0) + line(left, 0, right, 0) + line(right, 0, right, hook)
    + new NativeSymbols(measurer).text(ending.replaceAll(',', '.') + '.', left + size * (5 / 22), size * (15 / 22), labelSize)
}
