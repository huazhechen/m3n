import { scoreNavigationGlyphHeight, scoreAttachmentHeight } from './score-layout-policy.js'
import { SCORE_NUMBER_FONT, SCORE_MUSIC_FONT, SCORE_TEXT_FONT, SCORE_TEXT_WEIGHT } from './font-family.js'
import { scoreLayoutConfig } from './score-layout-config.js'
import { bravuraSvg, nativeDotSvg } from './bravura.js'
import { nativeSvgNumber as n } from './native-svg-number.js'
import { nativeNoteBody } from './native-note-body.js'
import { nativeMusicAxis } from './native-axis.js'
import { nativeMeterGeometry } from './native-meter.js'
import { nativeStyle } from './native-style.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import type { NativePitch, NativeControl } from './native-model.js'
import { nativeKeyGeometry } from './native-key.js'
import { nativeAccidentalGeometry, type NativeAccidentalGlyph } from './native-accidentals.js'
import { nativeArticulationSvg } from './native-articulations.js'
import { nativeFermataSvg } from './native-fermata.js'
import { nativeOrnamentSvg } from './native-ornaments.js'
import { nativeTempoGeometry, type NativeTempoGeometry } from './native-tempo.js'
import { nativeDynamicGlyph } from './native-dynamics.js'
import { nativeNavigationGlyph } from './native-navigation-glyphs.js'

const xmlEntities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
export function xml(value: string | number): string {
  const text = String(value)
  return /[&<>"']/.test(text) ? text.replace(/[&<>"']/g, character => xmlEntities[character]!) : text
}
export { nativeSvgNumber as n } from './native-svg-number.js'
export function attrs(values: Record<string, string | number | undefined>) {
  let result = ''
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) result += ` ${name}="${typeof value === 'number' ? n(value) : xml(value)}"`
  }
  return result
}
export const line = (x1: number, y1: number, x2: number, y2: number, width = (nativeStyle.music * .06)) => `<line${attrs({ x1, y1, x2, y2, stroke: '#000', 'stroke-width': width, 'stroke-linecap': 'round' })}/>`
export const circle = (x: number, y: number, radius = (nativeStyle.music * nativeStyle.durationDotRadiusEm), measurer: TextMeasurer = new DefaultTextMeasurer(), repeat = false) => nativeDotSvg(x,y,radius,measurer,repeat)
export const path = (d: string, fill = 'none', extra = '') => `<path d="${d}" fill="${fill}" stroke="#000" stroke-width="${n((nativeStyle.music * .05))}" stroke-linejoin="round"${extra}/>`

export class NativeSymbols {
  constructor(readonly measurer: TextMeasurer) {}
  dispose() {}
  text(text: string, x: number, y: number, size = nativeStyle.text, family = SCORE_TEXT_FONT, extra: Record<string, string | number | undefined> = {}): string {
    const fontWeight = extra['font-weight'] ?? (family === SCORE_TEXT_FONT ? SCORE_TEXT_WEIGHT : scoreLayoutConfig.fonts.regularWeight)
    const center = extra['text-anchor'] === 'middle'
    const offset = center ? this.measurer.measureText(text, { fontFamily: family, fontSize: size, fontWeight: Number(fontWeight), fontStyle: extra['font-style'] === 'italic' ? 'italic' : 'normal', textAlign: 'center' }).centerOffset ?? 0 : 0
    return `<text${attrs({ x: x - offset, y, 'font-size': size, 'font-family': family, 'font-weight': fontWeight, fill: '#000', 'xml:space': 'preserve', ...extra })}>${xml(text)}</text>`
  }

  sustain(x: number, y: number): string {
    const axis = y + nativeMusicAxis(this.measurer)
    return line(x - (nativeStyle.music * .2), axis, x + (nativeStyle.music * .2), axis, (nativeStyle.music * .09))
  }

  pitch(pitch: NativePitch, x: number, y: number, size = nativeStyle.music, beams = 0): string {
    let svg = this.text(pitch.degree, x, y, size, SCORE_NUMBER_FONT, { 'text-anchor': 'middle' })
    if (pitch.accidental) {
      const halfBody = this.measurer.measureText('0', { fontSize: size, fontFamily: SCORE_NUMBER_FONT }).w / 2
      const symbols = nativeAccidentalGeometry(pitch.accidental, size, halfBody, this.measurer)
      svg += `<g${attrs({ transform: `translate(${n(x)} ${n(y)})`, 'data-m3n-role': 'accidental' })}>`
        + symbols.glyphs.map(glyph => this.accidental(glyph)).join('') + '</g>'
    }
    const body = nativeNoteBody(this.measurer, size)
    for (let index = 0; index < Math.abs(pitch.octave); index++) {
      const offset = body.octaveY(pitch.octave > 0, index, beams)
      svg += circle(x, y + offset, size * nativeStyle.octaveDotRadiusEm, this.measurer)
    }
    return svg
  }

  accidental(glyph: NativeAccidentalGlyph): string {
    return this.text(glyph.character, glyph.x, glyph.y, glyph.fontSize, SCORE_MUSIC_FONT, { 'data-m3n-symbol': glyph.symbol, 'data-m3n-font': SCORE_MUSIC_FONT, 'aria-hidden': 'true' })
  }

  tempo(text: string, x: number, y: number, prepared?: NativeTempoGeometry): string {
    const geometry = prepared ?? nativeTempoGeometry(text, this.measurer)
    return `<g${attrs({ transform: `translate(${n(x)} ${n(y)})`, 'data-m3n-role': 'tempo', 'data-m3n-tempo-unit': geometry.unit })}>`
      + this.text(geometry.text, geometry.textX, geometry.baseline, nativeStyle.text, SCORE_NUMBER_FONT) + '</g>'
  }

  segno(x: number, y: number): string {
    const glyph = nativeNavigationGlyph('segno', scoreNavigationGlyphHeight(), this.measurer)
    return `<g transform="translate(${n(x)} ${n(y + nativeMusicAxis(this.measurer) - glyph.height / 2)})">${glyph.svg}</g>`
  }

  coda(x: number, y: number): string {
    const glyph = nativeNavigationGlyph('coda', scoreNavigationGlyphHeight(), this.measurer)
    const text = this.measurer.measureText('Coda', { fontSize: nativeStyle.text, fontFamily: SCORE_TEXT_FONT })
    return `<g data-m3n-role="coda" transform="translate(${n(x)} ${n(y + nativeMusicAxis(this.measurer) - glyph.height / 2)})">${glyph.svg}</g>`
      + this.text('Coda', x + glyph.width + nativeStyle.text * .3, y + nativeMusicAxis(this.measurer) + text.baseline - text.h / 2, nativeStyle.text, SCORE_TEXT_FONT)
  }

  mark(mark: string, x: number, y: number): string {
    if (mark === 'fermata') return `<g transform="translate(${n(x)} ${n(y)})">${nativeFermataSvg(undefined, this.measurer)}</g>`
    const dynamic = nativeDynamicGlyph(mark, undefined, this.measurer)
    if (dynamic) return `<g transform="translate(${n(x)} ${n(y)})">${dynamic.svg}</g>`
    const ornament = nativeOrnamentSvg(mark, undefined, this.measurer)
    if (ornament !== undefined) return `<g transform="translate(${n(x)} ${n(y)})">${ornament}</g>`
    const articulation = nativeArticulationSvg(mark, undefined, this.measurer)
    if (articulation !== undefined) return `<g transform="translate(${n(x)} ${n(y)})">${articulation}</g>`
    return this.text(/^f[1-5]$/.test(mark) ? mark.slice(1) : mark, x, y, /^f[1-5]$/.test(mark) ? nativeStyle.fingering : nativeStyle.grace, SCORE_TEXT_FONT, { 'text-anchor': 'middle', 'font-style': /^f[1-5]$/.test(mark) ? 'normal' : 'italic' })
  }

  control(control: NativeControl, x = 0, y = 0): string {
    if (control.kind === 'section') {
      const text = this.measurer.measureText(control.text, { fontSize: nativeStyle.annotation, fontFamily: SCORE_TEXT_FONT, fontWeight: scoreLayoutConfig.fonts.boldWeight })
      return `<rect${attrs({ x: x + nativeStyle.frameStroke / 2, y: y - control.top + nativeStyle.frameStroke / 2, width: control.width - nativeStyle.frameStroke, height: control.top + control.bottom - nativeStyle.frameStroke, stroke: '#000', 'stroke-width': nativeStyle.frameStroke, fill: 'none' })}/>` + this.text(control.text, x + (control.textInset ?? nativeStyle.annotation * 0.25), y + nativeMusicAxis(this.measurer) + text.baseline - text.h / 2, nativeStyle.annotation, SCORE_TEXT_FONT, { 'font-weight': scoreLayoutConfig.fonts.boldWeight })
    }
    if (control.kind === 'tempo') return this.tempo(control.text, x, y, control.tempoGeometry)
    if (control.kind === 'segno') return this.segno(x, y)
    if (control.kind === 'coda') return this.coda(x, y)
    if (control.kind === 'meter') {
      const meter = control.meterGeometry ?? nativeMeterGeometry(control.text, this.measurer)
      return this.text(meter.numerator, x + control.width / 2, y + meter.numeratorBaseline, (nativeStyle.music * .75), SCORE_NUMBER_FONT, { 'text-anchor': 'middle' })
        + `<rect${attrs({ x, y: y + meter.lineY, width: control.width, height: meter.lineHeight, fill: '#000' })}/>`
        + this.text(meter.denominator, x + control.width / 2, y + meter.denominatorBaseline, (nativeStyle.music * .75), SCORE_NUMBER_FONT, { 'text-anchor': 'middle' })
    }
    const geometry = nativeKeyGeometry(control.keyRows ?? [{key:control.text}],this.measurer)
    const axis = nativeMusicAxis(this.measurer)
    return geometry.rows.map(row => {
      const left = x+row.x, baseline = y+axis-geometry.height/2+row.y+row.baseline
      return this.text(row.prefix,left,baseline,nativeStyle.text,SCORE_NUMBER_FONT)
        + `<g transform="translate(${n(left+row.accidentalX)} ${n(baseline)})">`
        + row.glyphs.map(glyph => this.accidental(glyph)).join('') + '</g>'
        + this.text(row.name,left+row.nameX,baseline,nativeStyle.text,SCORE_NUMBER_FONT)
    }).join('')
  }

  rawMark(mark: string): string {
    if (mark === 'tip') return bravuraSvg('articStaccatissimoAboveSmall', (nativeStyle.music * .3), this.measurer)
    if (mark === 'brk') return bravuraSvg('articStaccatissimoAbove', scoreAttachmentHeight('brk')!, this.measurer)
    if (mark === 'hold') return bravuraSvg('articTenutoAbove', scoreAttachmentHeight('hold')!, this.measurer)
    return this.mark(mark, 0, 0)
  }
}
