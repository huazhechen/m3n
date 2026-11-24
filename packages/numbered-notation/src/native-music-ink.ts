import type { NativeGlyph } from './native-model.js'
import type { TextMeasurer } from './native-measure.js'
import { nativeNoteBody } from './native-note-body.js'
import { nativeMusicAxis } from './native-axis.js'
import { nativeAccidentalGeometry } from './native-accidentals.js'
import { nativePathInk, type NativeInk } from './native-ink.js'
import { nativeSvgNumber as n } from './native-svg-number.js'
import { nativeStyle, nativeEm as em } from './native-style.js'

/** The body's painted primitives, preserving SVG coordinate rounding and order.
 * Compute geometry directly; no SVG serialization, XML parsing or result cache. */
export function nativeBodyPieces(glyph: NativeGlyph, measurer: TextMeasurer, claimedBeams?: ReadonlySet<number>): NativeInk[] {
  const pieces: NativeInk[] = [], size = nativeStyle.music
  const line = (x1: number, y1: number, x2: number, y2: number, stroke: number) => {
    const half = n(stroke) / 2
    pieces.push({ left: Math.min(n(x1), n(x2)) - half, right: Math.max(n(x1), n(x2)) + half,
      top: Math.min(n(y1), n(y2)) - half, bottom: Math.max(n(y1), n(y2)) + half })
  }
  const circle = (x: number, y: number, radius: number) => {
    const r = n(radius)
    pieces.push({ left: n(x) - r, right: n(x) + r, top: n(y) - r, bottom: n(y) + r })
  }
  if (glyph.sustain) {
    const axis = glyph.y + nativeMusicAxis(measurer)
    line(glyph.x - em(4.62), axis, glyph.x + em(4.62), axis, em(2.2))
    return pieces
  }
  const body = nativeNoteBody(measurer), beamCount = Math.max(0, -Math.floor(Math.log2(glyph.writtenBeats)))
  for (const [index, pitch] of glyph.pitches.entries()) {
    const x = glyph.x, y = glyph.y + (glyph.pitchOffsets?.[index] ?? 0)
    const metrics = measurer.measureText(pitch.degree, { fontSize: size, fontFamily: 'M3N Numbers', fontWeight: 400, fontStyle: 'normal', textAlign: 'center' })
    const left = n(x - (metrics.centerOffset ?? 0)) - (metrics.advance ?? metrics.w) / 2
    pieces.push({ left: left + (metrics.inkLeft ?? 0), right: left + (metrics.inkRight ?? metrics.w),
      top: n(y) - metrics.baseline, bottom: n(y) - metrics.baseline + (metrics.inkBottom ?? metrics.h) })
    if (pitch.accidental) for (const symbol of nativeAccidentalGeometry(pitch.accidental, size, body.width / 2).paths) {
      const ink = nativePathInk(symbol.d), half = symbol.stroke ? n(symbol.stroke) / 2 : 0
      pieces.push({ left: ink.left - half + n(x), right: ink.right + half + n(x), top: ink.top - half + n(y), bottom: ink.bottom + half + n(y) })
    }
    for (let dot = 0; dot < Math.abs(pitch.octave); dot++) circle(x, y + body.octaveY(pitch.octave > 0, dot, index === 0 ? beamCount : 0), size * .075)
  }
  const base = 2 ** Math.floor(Math.log2(glyph.writtenBeats)), ratio = glyph.writtenBeats / base
  const dots = [1, 1.5, 1.75, 1.875].findIndex(value => Math.abs(ratio - value) < 1e-7)
  for (let index = 0; index < dots; index++) circle(glyph.x + body.width / 2 + em(4.29) + index * em(5.94), glyph.y + body.dotY, em(1.65))
  const beams = Math.max(0, Math.round(-Math.log2(base)))
  for (let index = 0; index < beams; index++) if (!claimedBeams?.has(index)) line(glyph.x - body.width / 2, glyph.y + body.beamY(index), glyph.x + body.width / 2, glyph.y + body.beamY(index), body.beamStroke)
  return pieces
}
