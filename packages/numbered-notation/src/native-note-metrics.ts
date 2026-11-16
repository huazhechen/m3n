import { nativeNoteBody } from './native-note-body.js'
import { nativeStyle, nativeEm as em } from './native-style.js'
import type { NativePitch } from './native-model.js'
import { NativeSymbols, line } from './native-symbols.js'
import { nativeSvgInk } from './native-ink.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
/** All vertical distances come from the primitives used to paint the note. */
export function nativeNoteMetrics(pitches: NativePitch[], writtenBeats: number, sustain: boolean, measurer: TextMeasurer = new DefaultTextMeasurer()) {
  const size = nativeStyle.music, gap = size * 0.12, painter = new NativeSymbols(measurer)
  const body = nativeNoteBody(measurer)
  const base = 2 ** Math.floor(Math.log2(writtenBeats))
  const beamCount = sustain ? 0 : Math.max(0, Math.round(-Math.log2(base)))
  const bounds = pitches.map((pitch, index) => {
    let svg = sustain ? painter.sustain(0, 0) : painter.pitch(pitch, 0, 0, size, index === 0 ? beamCount : 0)
    if (index === 0) for (let beam = 0; beam < beamCount; beam++) svg += line(-em(6), body.beamY(beam), em(7), body.beamY(beam), body.beamStroke)
    const ink = nativeSvgInk(svg, measurer)
    return { top: -ink.top, bottom: ink.bottom }
  })
  const offsets = [0]
  if (!sustain) for (let index = 1; index < pitches.length; index++) offsets.push(offsets[index - 1]! - bounds[index - 1]!.top - gap - bounds[index]!.bottom)
  return { offsets, top: Math.max(...bounds.map((bound, index) => bound.top - (offsets[index] ?? 0))), bottom: bounds[0]?.bottom ?? 0, beamCount }
}

export function nativeBeamCount(a: import('./native-model.js').NativeGlyph, b: import('./native-model.js').NativeGlyph) {
  if (a.sustain || b.sustain) return 0
  if (Math.abs(a.time + a.beats - b.time) > 1e-7) return 0
  const unit = a.event?.meterUnit ?? 4, count = a.event?.meterCount ?? 4
  const group = 4 / unit * (unit >= 8 && count % 3 === 0 ? 3 : 1)
  if (a.event?.kind === 'tuplet' ? a.event !== b.event : Math.floor((a.time + 1e-8) / group) !== Math.floor((b.time + 1e-8) / group)) return 0
  return Math.max(0, -Math.floor(Math.log2(Math.max(a.writtenBeats, b.writtenBeats))))
}

/** Octave dots need an extra 0.05em between their musical bounds and an arc port. */
export function nativeTiePortTop(glyph: { top: number; musicTop?: number; tieTop?: number; sustain: boolean; pitches: NativePitch[] }): number {
  // Inline key/meter/tempo controls occupy their own columns, outside the note.
  return (glyph.tieTop ?? glyph.musicTop ?? glyph.top) + (!glyph.sustain && glyph.pitches.some(pitch => pitch.octave > 0) ? nativeStyle.music * 0.05 : 0)
}
