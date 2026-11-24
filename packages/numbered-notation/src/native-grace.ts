import { nativeNoteBody } from './native-note-body.js'
import { nativeAccidentalAdvance } from './native-accidentals.js'
import { nativeEm, nativeStyle } from './native-style.js'
import { NativeSymbols, attrs, circle, line, n } from './native-symbols.js'
import { nativeSvgInk, unionNativeInk, translateNativeInk } from './native-ink.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import type { NativePitch } from './native-model.js'

export type NativeGracePitch = NativePitch & { writtenBeats?: number }

/** A rigid, measured grace block. Coordinates are relative to the main baseline.
 * Subdivision belongs to each note, so mixed-depth groups retain their beams.
 */
export function nativeGraceGeometry(pitches: readonly NativeGracePitch[], mainLeft: number, measurer: TextMeasurer = new DefaultTextMeasurer()) {
  const size = nativeStyle.graceNote, painter = new NativeSymbols(measurer)
  const number = measurer.measureText('0', {fontSize: size, fontFamily: 'M3N Numbers'})
  const { beamStroke: stroke } = nativeNoteBody(measurer, size)
  const half = number.w / 2, beamStep = size * 0.14
  const digits = pitches.map(pitch => nativeSvgInk(painter.text(pitch.degree, 0, 0, size, 'M3N Numbers', { 'text-anchor': 'middle' }), measurer))
  const beamY = Math.max(...digits.map(digit => digit.bottom)) + size * 0.12 + stroke / 2
  const notes = pitches.map((pitch, index) => {
    const beats = pitch.writtenBeats ?? 0.25
    if (!Number.isFinite(beats) || beats <= 0) throw new Error('倚音书面时值必须为正有限数。')
    const beams = Math.max(1, Math.round(-Math.log2(beats)))
    let svg = painter.pitch({ ...pitch, octave: 0 }, 0, 0, size, beams)
    const digit = digits[index]!
    const radius = size * 0.075, gap = size * 0.08
    const bottom = Math.max(digit.bottom, beamY + (beams - 1) * beamStep + stroke / 2)
    for (let index = 0; index < Math.abs(pitch.octave); index++) {
      const offset = gap + radius + index * (2 * radius + gap)
      svg += circle(0, pitch.octave > 0 ? digit.top - offset : bottom + offset, radius, measurer)
    }
    const bodySvg = svg
    for (let beam = 0; beam < beams; beam++) svg += line(-half, beamY + beam * beamStep, half, beamY + beam * beamStep, stroke)
    const ink = nativeSvgInk(svg, measurer)
    // Keep the measured body/accidental advance as a minimum footprint,
    // while retaining overhang and round caps from the actual paint.
    const footprint = { ...ink, left: Math.min(ink.left, -half - nativeAccidentalAdvance(pitch.accidental, size, measurer)), right: Math.max(ink.right, half) }
    return { pitch, beats, beams, svg, bodySvg, ink, footprint, x: 0, y: 0 }
  })
  if (!notes.length) throw new Error('倚音块不能为空。')
  let end = 0
  for (const [index, note] of notes.entries()) {
    // Grace notes form a rigid ornament: durations only affect beams.
    const gap = index ? nativeEm(1) : 0
    note.x = end + gap - note.ink.left
    end = note.x + note.ink.right
  }
  const block = unionNativeInk(notes.map(note => translateNativeInk(note.footprint, note.x, 0)))
  const sideGap = size * 0.2
  const main = measurer.measureText('0', {fontSize: nativeStyle.music, fontFamily: 'M3N Numbers'})
  const x = -mainLeft - sideGap - block.right
  const y = -main.baseline - size * 0.18 - block.bottom
  for (const note of notes) {
    note.x += x; note.y = y
  }
  const claimed = notes.map(() => new Set<number>())
  let joined = ''
  // Paint a common level as one stroke, including mixed-depth subgroups.
  // Overlapping round caps at internal joins otherwise darken the raster.
  for (let beam = 0; beam < Math.max(...notes.map(note => note.beams)); beam++) {
    for (let start = 0; start < notes.length;) {
      if (notes[start]!.beams <= beam) { start++; continue }
      let end = start + 1
      while (end < notes.length && notes[end]!.beams > beam) end++
      if (end - start > 1) {
        for (let index = start; index < end; index++) claimed[index]!.add(beam)
        joined += line(notes[start]!.x - half, y + beamY + beam * beamStep, notes[end - 1]!.x + half, y + beamY + beam * beamStep, stroke)
      }
      start = end
    }
  }
  let svg = notes.map((note, index) => {
    let paint = note.bodySvg
    for (let beam = 0; beam < note.beams; beam++) if (!claimed[index]!.has(beam)) paint += line(-half, beamY + beam * beamStep, half, beamY + beam * beamStep, stroke)
    return `<g${attrs({ transform: `translate(${n(note.x)} ${n(note.y)})`, 'data-m3n-role': 'grace-note', 'data-m3n-beams': note.beams })}>${paint}</g>`
  }).join('') + joined
  const near = notes.at(-1)!, hook = { x: near.x, y: y + block.bottom }
  const p = (a: number, b: number) => `${n(hook.x + a * size)} ${n(hook.y + b * size)}`
  svg += `<path${attrs({ d: `M${p(0,0)} C${p(-0.01,0.26)} ${p(0.14,0.42)} ${p(0.29,0.36)}`, fill: 'none', stroke: '#000', 'stroke-width': size * 0.07, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })}/>`
  svg = `<g data-m3n-role="grace">${svg}</g>`
  const ink = nativeSvgInk(svg, measurer)
  return { notes, hook, size, sideGap, svg, ink, width: block.right - block.left, left: Math.max(mainLeft + sideGap + block.right - block.left, -ink.left) }
}
