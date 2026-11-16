import type { TextMeasurer } from './native-measure.js'
import { nativeStyle } from './native-style.js'

/** Visual center of the music body relative to its alphabetic baseline. */
export function nativeMusicAxis(measurer: TextMeasurer): number {
  const zero = measurer.measureText('0', { fontSize: nativeStyle.music, fontFamily: 'M3N Numbers' })
  return zero.h / 2 - zero.baseline
}
