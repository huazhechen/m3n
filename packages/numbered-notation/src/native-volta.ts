import { scoreLayoutConfig } from './score-layout-config.js'
import { SCORE_NUMBER_FONT } from './font-family.js'
import { nativeStyle } from './native-style.js'
import { NativeSymbols, line } from './native-symbols.js'
import type { TextMeasurer } from './native-measure.js'

/** Only the true endpoints have hooks; the label belongs to the first fragment. */
export function nativeVoltaSvg(left: number, right: number, ending: string, measurer: TextMeasurer,
  first = true, last = true): string {
  const labelSize = nativeStyle.voltaLabel, stroke = scoreLayoutConfig.numbered.voltaStroke
  const text = [...new Set([...ending.matchAll(/\d+/g)].map(match => Number(match[0])))].sort((a, b) => a - b).map(pass => `${pass}.`).join('')
  const metrics = measurer.measureText(text, { fontSize: labelSize, fontFamily: SCORE_NUMBER_FONT, fontWeight: scoreLayoutConfig.fonts.textWeight })
  const height = metrics.inkBottom ?? metrics.h, hook = height * scoreLayoutConfig.numbered.voltaHookRatio
  return line(left, 0, right, 0, stroke)
    + (first ? line(left, 0, left, hook, stroke)
      + new NativeSymbols(measurer).text(text, left + scoreLayoutConfig.numbered.voltaTextInset, (hook - height) / 2 + metrics.baseline, labelSize, SCORE_NUMBER_FONT, { 'font-weight': scoreLayoutConfig.fonts.textWeight }) : '')
    + (last ? line(right, 0, right, hook, stroke) : '')
}
