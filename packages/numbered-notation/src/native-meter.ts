import type { TextMeasurer } from './native-measure.js'
import { nativeStyle } from './native-style.js'
import { nativeMusicAxis } from './native-axis.js'

export type NativeMeterGeometry = {
  numerator: string; denominator: string; width: number; lineY: number; lineHeight: number
  numeratorBaseline: number; denominatorBaseline: number
}

/** The fraction rule shares the measured musical axis. Both digits clear the
 * rule by a design gap, independently of their actual ascent and descent. */
export function nativeMeterGeometry(text: string, measurer: TextMeasurer): NativeMeterGeometry {
  const [numerator = '', denominator = ''] = text.split('/')
  const size = nativeStyle.meter, style = { fontSize: size, fontFamily: 'M3N Numbers' }
  const num = measurer.measureText(numerator, style), den = measurer.measureText(denominator, style)
  const gap = size * 0.08, lineHeight = Math.max(1, size * 0.06)
  const lineY = nativeMusicAxis(measurer) - lineHeight / 2
  return { numerator, denominator, width: Math.max(num.w, den.w) + size * 0.16, lineY, lineHeight,
    numeratorBaseline: lineY - gap - num.h + num.baseline,
    denominatorBaseline: lineY + lineHeight + gap + den.baseline }
}
