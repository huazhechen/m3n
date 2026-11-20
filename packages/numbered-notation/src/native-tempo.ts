import type { TextMeasurer } from './native-measure.js'
import { nativeMusicAxis } from './native-axis.js'
import { nativeStyle } from './native-style.js'
export type NativeTempoGeometry = { unit: number; text: string; width: number; anchor: number; textX: number; baseline: number }
export function nativeTempoGeometry(text: string, measurer: TextMeasurer, unit = 4): NativeTempoGeometry {
  const size = nativeStyle.text
  const metrics = measurer.measureText(text, { fontSize: size, fontFamily: 'M3N Numbers' })
  const baseline = nativeMusicAxis(measurer) + metrics.baseline - (metrics.inkBottom ?? metrics.h) / 2
  const textX = 0
  const anchor = measurer.measureText(text[0] ?? '', { fontSize: size, fontFamily: 'M3N Numbers' }).w / 2
  return { unit, text, textX, baseline, width: metrics.w, anchor }
}
