import { nativeNoteBody } from './native-note-body.js'
import { nativeStyle } from './native-style.js'
import type { NativeGlyph, NativePitch } from './native-model.js'
import { nativeInnerMark } from './native-marks.js'
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
    if (index === 0) for (let beam = 0; beam < beamCount; beam++) svg += line(-body.width / 2, body.beamY(beam), body.width / 2, body.beamY(beam), body.beamStroke)
    const ink = nativeSvgInk(svg, measurer)
    return { top: -ink.top, bottom: ink.bottom }
  })
  const offsets = [0]
  if (!sustain) for (let index = 1; index < pitches.length; index++) offsets.push(offsets[index - 1]! - bounds[index - 1]!.top - gap - bounds[index]!.bottom)
  return { offsets, top: Math.max(...bounds.map((bound, index) => bound.top - (offsets[index] ?? 0))), bottom: bounds[0]?.bottom ?? 0, beamCount }
}

export function nativeBeamCount(a: import('./native-model.js').NativeGlyph, b: import('./native-model.js').NativeGlyph) {
  if (a.sustain || b.sustain) return 0
  // Controls occupy separate zero-time columns before their host. They split
  // the painted run even when the surrounding notes share a metrical beat.
  if (b.controls.length) return 0
  if (Math.abs(a.time + a.beats - b.time) > 1e-7) return 0
  const unit = a.event?.meterUnit ?? 4, count = a.event?.meterCount ?? 4
  const group = 4 / unit * (unit >= 8 && count % 3 === 0 ? 3 : 1)
  // A tuplet is an internal beam group. Its boundaries can also join ordinary
  // subdivisions within the same beat, in either direction.
  const sameTuplet = a.event?.kind === 'tuplet' && a.event === b.event
  if (!sameTuplet && Math.floor((a.time + 1e-8) / group) !== Math.floor((b.time + 1e-8) / group)) return 0
  return Math.max(0, -Math.floor(Math.log2(Math.max(a.writtenBeats, b.writtenBeats))))
}

/** Only exposed octave dots at the top of the musical stack need an extra gap. */
export function nativeTiePortTop(glyph: Pick<NativeGlyph, 'top' | 'musicTop' | 'tieTop' | 'sustain' | 'pitches' | 'markLayout'>): number {
  // Inline key/meter/tempo controls occupy their own columns, outside the note.
  const exposedDots = !glyph.sustain && (glyph.pitches.at(-1)?.octave ?? 0) > 0
    && !glyph.markLayout?.some(mark => nativeInnerMark(mark.name))
  return (glyph.tieTop ?? glyph.musicTop ?? glyph.top) + (exposedDots ? nativeStyle.music * 0.05 : 0)
}
