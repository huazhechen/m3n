import type { TextMeasurer } from './native-measure.js'
import { nativeStyle } from './native-style.js'

/** Music body coordinates relative to its alphabetic baseline. Design gaps
 * use the note size; font edges come from the same zero used by the layout. */
export function nativeNoteBody(measurer: TextMeasurer, size = nativeStyle.music) {
  const zero = measurer.measureText('0', { fontSize: size, fontFamily: 'M3N Numbers' })
  const top = -zero.baseline, bottom = (zero.inkBottom ?? zero.h) - zero.baseline
  const beamStroke = size * .055, beamStep = size * .14
  const beamY = (index: number) => bottom + size * .12 + beamStroke / 2 + index * beamStep
  return { top, bottom, width: zero.w, dotY: zero.h * .64 - zero.baseline,
    beamStroke, beamY,
    octaveY: (above: boolean, index: number, beams = 0) => above
      ? top - size * (.08 + .075 + index * .23)
      : (beams ? beamY(beams - 1) + beamStroke / 2 : bottom + size * .04) + size * (.08 + .075 + index * .23) }
}
