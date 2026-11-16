import type { TextMeasurer } from './native-measure.js'
import { nativeStyle } from './native-style.js'

/** Visual center of the music body relative to its alphabetic baseline. */
export function nativeMusicAxis(measurer: TextMeasurer, size = nativeStyle.music): number {
  const zero = measurer.measureText('0', { fontSize: size, fontFamily: 'M3N Numbers' })
  return zero.h / 2 - zero.baseline
}
