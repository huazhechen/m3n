import type { NativePitch } from './native-model.js'
/** All vertical distances are relative to the principal number's text baseline. */
export function nativeNoteMetrics(pitches: NativePitch[], writtenBeats: number, sustain: boolean) {
  const size = 22, baseline = size * 0.8, gap = size * 0.12
  const base = 2 ** Math.floor(Math.log2(writtenBeats))
  const beamCount = sustain ? 0 : Math.max(0, Math.round(-Math.log2(base)))
  const beamBottom = size * 0.92 + (beamCount - 1) * size * 0.14 + Math.max(1, size * 0.055)
  const bounds = pitches.map((pitch, index) => {
    const above = sustain ? 0 : Math.max(0, pitch.octave), below = sustain ? 0 : Math.max(0, -pitch.octave)
    const top = baseline + above * size * 0.23
    const beamed = beamCount > 0 && index === 0
    let decorationBottom = beamed ? beamBottom : size * 0.84
    if (below) decorationBottom += below * size * 0.23
    return { top, bottom: (beamed ? decorationBottom : Math.max(size, decorationBottom)) - baseline }
  })
  const offsets = [0]
  if (!sustain) for (let index = 1; index < pitches.length; index++) offsets.push(offsets[index - 1]! - bounds[index - 1]!.top - gap - bounds[index]!.bottom)
  return { offsets, top: Math.max(...bounds.map((bound, index) => bound.top - (offsets[index] ?? 0))), bottom: bounds[0]?.bottom ?? size - baseline, beamCount }
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
export function nativeTiePortTop(glyph: { top: number; sustain: boolean; pitches: NativePitch[] }): number {
  return glyph.top + (!glyph.sustain && glyph.pitches.some(pitch => pitch.octave > 0) ? 22 * 0.05 : 0)
}
