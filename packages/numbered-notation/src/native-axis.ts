import { SCORE_NUMBER_FONT } from './font-family.js'
import type { TextMeasurer } from './native-measure.js'
import { nativeStyle } from './native-style.js'

/** Visual center of the music body relative to its alphabetic baseline. */
export function nativeMusicAxis(measurer: TextMeasurer, size = nativeStyle.music): number {
  const zero = measurer.measureText('0', { fontSize: size, fontFamily: SCORE_NUMBER_FONT })
  return zero.h / 2 - zero.baseline
}
