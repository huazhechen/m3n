import { scoreLayoutConfig } from './score-layout-config.js'
import { SCORE_NUMBER_FONT } from './font-family.js'
import { nativeDotInk } from './bravura.js'
import type { NativeGlyph } from './native-model.js'
import type { TextMeasurer } from './native-measure.js'
import { nativeNoteBody } from './native-note-body.js'
import { nativeMusicAxis } from './native-axis.js'
import { nativeAccidentalGeometry } from './native-accidentals.js'
import { type NativeInk } from './native-ink.js'
import { nativeSvgNumber as n } from './native-svg-number.js'
import { nativeStyle } from './native-style.js'

/** The body's painted primitives, preserving SVG coordinate rounding and order.
 * Compute geometry directly; no SVG serialization, XML parsing or result cache. */
export function nativeBodyPieces(glyph: NativeGlyph, measurer: TextMeasurer, claimedBeams?: ReadonlySet<number>): NativeInk[] {
  const pieces: NativeInk[] = [], size = nativeStyle.music
  const line = (x1: number, y1: number, x2: number, y2: number, stroke: number) => {
    const half = n(stroke) / 2, a = n(x1), b = n(x2), c = n(y1), d = y1 === y2 ? c : n(y2)
    pieces.push({ left: Math.min(a,b) - half, right: Math.max(a,b) + half,
      top: Math.min(c,d) - half, bottom: Math.max(c,d) + half })
  }
  const circle = (x: number, y: number, radius: number) => {
    pieces.push(nativeDotInk(x,y,radius,measurer))
  }
  if (glyph.sustain) {
    const axis = glyph.y + nativeMusicAxis(measurer)
    line(glyph.x - (nativeStyle.music * .2), axis, glyph.x + (nativeStyle.music * .2), axis, (nativeStyle.music * .09))
    return pieces
  }
  const body = nativeNoteBody(measurer), beamCount = Math.max(0, -Math.floor(Math.log2(glyph.writtenBeats)))
  for (const [index, pitch] of glyph.pitches.entries()) {
    const x = glyph.x, y = glyph.y + (glyph.pitchOffsets?.[index] ?? 0)
    const metrics = measurer.measureText(pitch.degree, { fontSize: size, fontFamily: SCORE_NUMBER_FONT, fontWeight: scoreLayoutConfig.fonts.regularWeight, fontStyle: 'normal', textAlign: 'center' })
    const qx = n(x), qy = n(y)
    const left = (metrics.centerOffset ? n(x - metrics.centerOffset) : qx) - (metrics.advance ?? metrics.w) / 2
    pieces.push({ left: left + (metrics.inkLeft ?? 0), right: left + (metrics.inkRight ?? metrics.w),
      top: qy - metrics.baseline, bottom: qy - metrics.baseline + (metrics.inkBottom ?? metrics.h) })
    if (pitch.accidental) for (const symbol of nativeAccidentalGeometry(pitch.accidental, size, body.width / 2, measurer).glyphs) {
      const ink = symbol.ink
      pieces.push({ left: ink.left + qx, right: ink.right + qx, top: ink.top + qy, bottom: ink.bottom + qy })
    }
    for (let dot = 0; dot < Math.abs(pitch.octave); dot++) circle(x, y + body.octaveY(pitch.octave > 0, dot, index === 0 ? beamCount : 0), size * nativeStyle.octaveDotRadiusEm)
  }
  const base = 2 ** Math.floor(Math.log2(glyph.writtenBeats)), ratio = glyph.writtenBeats / base
  const dots = [1, 1.5, 1.75, 1.875].findIndex(value => Math.abs(ratio - value) < 1e-7)
  for (let index = 0; index < dots; index++) circle(glyph.x + body.width / 2 + (nativeStyle.music * .18) + index * (nativeStyle.music * .25), glyph.y + body.dotY, (nativeStyle.music * nativeStyle.durationDotRadiusEm))
  const beams = Math.max(0, Math.round(-Math.log2(base)))
  for (let index = 0; index < beams; index++) if (!claimedBeams?.has(index)) line(glyph.x - body.width / 2 + body.beamStroke / 2, glyph.y + body.beamY(index), glyph.x + body.width / 2 - body.beamStroke / 2, glyph.y + body.beamY(index), body.beamStroke)
  return pieces
}
