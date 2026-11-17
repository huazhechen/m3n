import { nativeStyle } from './native-style.js'
import { NativeSymbols, line } from './native-symbols.js'
import type { TextMeasurer } from './native-measure.js'

/** Only the true endpoints have hooks; the label belongs to the first fragment. */
export function nativeVoltaSvg(left: number, right: number, ending: string, measurer: TextMeasurer,
  first = true, last = true): string {
  const size = nativeStyle.music, labelSize = size * 0.6, stroke = size * 0.055
  const text = [...new Set([...ending.matchAll(/\d+/g)].map(match => Number(match[0])))].sort((a, b) => a - b).map(pass => `${pass}.`).join('')
  const metrics = measurer.measureText(text, { fontSize: labelSize, fontFamily: 'M3N Numbers' })
  const height = metrics.inkBottom ?? metrics.h, hook = height * 1.2
  return line(left, 0, right, 0, stroke)
    + (first ? line(left, 0, left, hook, stroke)
      + new NativeSymbols(measurer).text(text, left + size * 0.15, (hook - height) / 2 + metrics.baseline, labelSize, 'M3N Numbers') : '')
    + (last ? line(right, 0, right, hook, stroke) : '')
}
