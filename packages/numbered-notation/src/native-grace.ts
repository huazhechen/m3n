import { nativeStyle, nativeEm as em } from './native-style.js'
import type { NativePitch } from './native-model.js'

/** Grace digits and their slur share one lane-relative drawing/measurement model. */
export function nativeGraceGeometry(pitches: readonly NativePitch[], musicLeft: number) {
  const notes = pitches.map((pitch, index) => ({ pitch, x: -musicLeft + em(3) + index * em(14), y: -em(15) }))
  const start = { x: notes[0]?.x ?? 0, y: -em(29) }, control = { x: start.x / 2, y: -em(39) }, end = { x: -em(4), y: -nativeStyle.music }
  return { notes, start, control, end, beamY: -em(11) }
}
