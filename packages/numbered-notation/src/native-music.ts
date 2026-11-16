import { nativeMusicAxis } from './native-axis.js'
import { nativeArpeggioGeometry } from './native-arpeggio.js'
import { nativeSvgInk } from './native-ink.js'
import { nativeStyle, nativeEm as em } from './native-style.js'
import { NativeSymbols, attrs, n, line, circle } from './native-symbols.js'
import { nativeGraceGeometry } from './native-grace.js'
import { nativeMarkStack } from './native-marks.js'
import { nativeNoteMetrics, nativeBeamCount } from './native-note-metrics.js'
import type { NativeGlyph } from './native-model.js'

export function nativeBeamSvg(a: NativeGlyph, b: NativeGlyph): string {
  let svg = ''
  for (let beam = 0; beam < nativeBeamCount(a, b); beam++) svg += line(a.x + em(5.577), a.y + em(3.245) + beam * em(3.08), b.x - em(5.577), b.y + em(3.245) + beam * em(3.08), em(1.21))
  return svg
}

export class NativeMusicPainter extends NativeSymbols {
  music(glyph: NativeGlyph): string {
    if (glyph.multiRest) {
      const size = nativeStyle.music, text = String(glyph.multiRest)
      const metrics = this.measurer.measureText(text, { fontSize: size, fontFamily: 'M3N Numbers' })
      const width = Math.max(size * 3, metrics.w + size * 0.5), left = glyph.x - size * 0.4, right = left + width
      const axis = glyph.y + nativeMusicAxis(this.measurer), stroke = size * 0.12, halfCap = (size * 0.65 - stroke) / 2
      return `<g data-m3n-role="multi-rest">`
        + line(left + stroke, axis, right - stroke, axis, stroke * 2)
        + line(left + stroke / 2, axis - halfCap, left + stroke / 2, axis + halfCap, stroke)
        + line(right - stroke / 2, axis - halfCap, right - stroke / 2, axis + halfCap, stroke)
        + this.text(text, left + width / 2, axis - metrics.h - size * 0.175 + metrics.baseline, size, 'M3N Numbers', { 'text-anchor': 'middle' }) + '</g>'
    }
    let music = this.body(glyph)
    if (glyph.graces.length) {
      const grace = glyph.graceLayout ?? nativeGraceGeometry(glyph.graces, glyph.musicLeft ?? glyph.left, this.measurer)
      music += `<g${attrs({ transform: `translate(${n(glyph.x)} ${n(glyph.y)})` })}>${grace.svg}</g>`
    }
    const markStack = glyph.markLayout ?? nativeMarkStack(glyph.marks, nativeNoteMetrics(glyph.pitches, glyph.writtenBeats, glyph.sustain, this.measurer).top, this.measurer).items
    for (const mark of markStack) music += `<g${attrs({ transform: `translate(${n(glyph.x)} ${n(glyph.y + mark.y)})`, 'data-m3n-role': 'mark', 'data-m3n-mark': mark.name })}>${this.rawMark(mark.name)}</g>`
    if (glyph.event?.postfixes.includes('arp') && glyph.pitches.length > 1 && !glyph.sustain) {
      const arpeggio = glyph.arpeggioLayout ?? nativeArpeggioGeometry(nativeSvgInk(this.body({ ...glyph, x: 0, y: 0 }), this.measurer), this.measurer)
      music += `<g transform="translate(${n(glyph.x)} ${n(glyph.y)})">${arpeggio.svg}</g>`
    }
    return music
  }

  /** Main music only, before grace notes, ornaments and arpeggio. */
  body(glyph: NativeGlyph): string {
    let music = ''
    if (glyph.sustain) music += this.sustain(glyph.x, glyph.y)
    else {
      const beamCount = Math.max(0, -Math.floor(Math.log2(glyph.writtenBeats)))
      glyph.pitches.forEach((pitch, index) => { music += this.pitch(pitch, glyph.x, glyph.y + (glyph.pitchOffsets?.[index] ?? 0), nativeStyle.music, index === 0 ? beamCount : 0) })
      const base = 2 ** Math.floor(Math.log2(glyph.writtenBeats)), ratio = glyph.writtenBeats / base
      const dots = [1, 1.5, 1.75, 1.875].findIndex(value => Math.abs(ratio - value) < 1e-7)
      for (let index = 0; index < dots; index++) music += circle(glyph.x + this.measurer.measureText('0',{fontSize: nativeStyle.music,fontFamily:'M3N Numbers'}).w / 2 + em(4.29) + index * em(5.94), glyph.y - em(3.52), em(1.65))
      const beams = Math.max(0, Math.round(-Math.log2(base)))
      for (let index = 0; index < beams; index++) music += line(glyph.x - em(6), glyph.y + em(3.245) + index * em(3.08), glyph.x + em(7), glyph.y + em(3.245) + index * em(3.08), em(1.21))
    }
    return music
  }
}
