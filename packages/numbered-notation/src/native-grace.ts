import type { NativePitch } from './native-model.js'

/** Grace digits and their slur share one lane-relative drawing/measurement model. */
export function nativeGraceGeometry(pitches: readonly NativePitch[], musicLeft: number) {
  const notes = pitches.map((pitch, index) => ({ pitch, x: -musicLeft + 3 + index * 14, y: -15 }))
  const start = { x: notes[0]?.x ?? 0, y: -29 }, control = { x: start.x / 2, y: -39 }, end = { x: -4, y: -22 }
  const t = Math.max(0, Math.min(1, (start.y - control.y) / (start.y - 2 * control.y + end.y)))
  const minimumY = (1 - t) ** 2 * start.y + 2 * (1 - t) * t * control.y + t ** 2 * end.y
  const noteTop = Math.max(0, ...pitches.map(pitch => 15 + 13 * 0.8 + Math.max(0, pitch.octave) * 13 * 0.23))
  return { notes, start, control, end, beamY: -11, top: pitches.length ? Math.max(noteTop, -minimumY + 0.6) : 0 }
}
