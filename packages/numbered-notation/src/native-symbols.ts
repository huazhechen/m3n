import { nativeSvgNumber as n } from './native-svg-number.js'
import { nativeNoteBody } from './native-note-body.js'
import { nativeMusicAxis } from './native-axis.js'
import { nativeMeterGeometry } from './native-meter.js'
import { nativeStyle, nativeEm as em, nativeDesignPath } from './native-style.js'
import type { TextMeasurer } from './native-measure.js'
import type { NativePitch, NativeControl } from './native-model.js'
import { nativeKeyGeometry } from './native-key.js'
import { nativeAccidentalGeometry } from './native-accidentals.js'
import { nativeArticulationSvg } from './native-articulations.js'
import { nativeFermataSvg } from './native-fermata.js'
import { nativeOrnamentSvg } from './native-ornaments.js'
import { nativeTempoGeometry, type NativeTempoGeometry } from './native-tempo.js'
import { nativeDynamicGlyph } from './native-dynamics.js'
import { nativeNavigationGlyph } from './native-navigation-glyphs.js'

export const xml = (value: string | number) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
export { nativeSvgNumber as n } from './native-svg-number.js'
export function attrs(values: Record<string, string | number | undefined>) { return Object.entries(values).filter(([, value]) => value !== undefined).map(([name, value]) => ` ${name}="${xml(typeof value === 'number' ? n(value) : value!)}"`).join('') }
export const line = (x1: number, y1: number, x2: number, y2: number, width = nativeStyle.stroke) => `<line${attrs({ x1, y1, x2, y2, stroke: '#000', 'stroke-width': width, 'stroke-linecap': 'round' })}/>`
export const circle = (x: number, y: number, radius = em(1.6)) => `<circle${attrs({ cx: x, cy: y, r: radius, fill: '#000' })}/>`
export const path = (d: string, fill = 'none', extra = '') => `<path d="${d}" fill="${fill}" stroke="#000" stroke-width="${n(nativeStyle.symbolStroke)}" stroke-linejoin="round"${extra}/>`

export class NativeSymbols {
  constructor(readonly measurer: TextMeasurer) {}
  dispose() {}
  text(text: string, x: number, y: number, size = nativeStyle.text, family = 'serif', extra: Record<string, string | number | undefined> = {}): string {
    const center = extra['text-anchor'] === 'middle'
    const offset = center ? this.measurer.measureText(text, { fontFamily: family, fontSize: size, fontWeight: Number(extra['font-weight'] ?? 400), fontStyle: extra['font-style'] === 'italic' ? 'italic' : 'normal', textAlign: 'center' }).centerOffset ?? 0 : 0
    return `<text${attrs({ x: x - offset, y, 'font-size': size, 'font-family': family, fill: '#000', 'xml:space': 'preserve', ...extra })}>${xml(text)}</text>`
  }

  sustain(x: number, y: number): string {
    const axis = y + nativeMusicAxis(this.measurer)
    return line(x - em(4.62), axis, x + em(4.62), axis, em(2.2))
  }

  pitch(pitch: NativePitch, x: number, y: number, size = nativeStyle.music, beams = 0): string {
    let svg = this.text(pitch.degree, x, y, size, 'M3N Numbers', { 'text-anchor': 'middle' })
    if (pitch.accidental) {
      const halfBody = this.measurer.measureText('0', { fontSize: size, fontFamily: 'M3N Numbers' }).w / 2
      const symbols = nativeAccidentalGeometry(pitch.accidental, size, halfBody)
      svg += `<g${attrs({ transform: `translate(${n(x)} ${n(y)})`, 'data-m3n-role': 'accidental' })}>`
        + symbols.paths.map(symbol => `<path${attrs({ d: symbol.d, fill: 'none', stroke: '#000', 'stroke-width': symbol.stroke, 'data-m3n-symbol': symbol.symbol, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })}/>`).join('') + '</g>'
    }
    const body = nativeNoteBody(this.measurer, size)
    for (let index = 0; index < Math.abs(pitch.octave); index++) {
      const offset = body.octaveY(pitch.octave > 0, index, beams)
      svg += circle(x, y + offset, size * 0.075)
    }
    return svg
  }

  tempo(text: string, x: number, y: number, prepared?: NativeTempoGeometry): string {
    const geometry = prepared ?? nativeTempoGeometry(text, this.measurer)
    return `<g${attrs({ transform: `translate(${n(x)} ${n(y)})`, 'data-m3n-role': 'tempo', 'data-m3n-tempo-unit': geometry.unit })}>`
      + `<path${attrs({ d: geometry.path, fill: '#000' })}/>`
      + this.text(geometry.text, geometry.textX, geometry.baseline, nativeStyle.text, 'M3N Numbers') + '</g>'
  }

  segno(x: number, y: number): string {
    const glyph = nativeNavigationGlyph('segno', nativeStyle.text * 1.15)
    return `<g transform="translate(${n(x)} ${n(y + nativeMusicAxis(this.measurer) - glyph.height / 2)})"><path d="${glyph.path}" fill="#000"/></g>`
  }

  mark(mark: string, x: number, y: number): string {
    if (mark === 'fermata') return `<g transform="translate(${n(x)} ${n(y)})">${nativeFermataSvg()}</g>`
    const dynamic = nativeDynamicGlyph(mark)
    if (dynamic) return `<g transform="translate(${n(x)} ${n(y)})">${dynamic.paths.map(d => `<path d="${d}" fill="#000"/>`).join('')}</g>`
    const ornament = nativeOrnamentSvg(mark)
    if (ornament !== undefined) return `<g transform="translate(${n(x)} ${n(y)})">${ornament}</g>`
    const articulation = nativeArticulationSvg(mark)
    if (articulation !== undefined) return `<g transform="translate(${n(x)} ${n(y)})">${articulation}</g>`
    return this.text(/^f[1-5]$/.test(mark) ? mark.slice(1) : mark, x, y, /^f[1-5]$/.test(mark) ? nativeStyle.music * 0.5 : nativeStyle.grace, 'serif', { 'text-anchor': 'middle' })
  }

  control(control: NativeControl, x = 0, y = 0): string {
    if (control.kind === 'section') {
      const text = this.measurer.measureText(control.text, { fontSize: nativeStyle.annotation, fontFamily: 'serif', fontWeight: 700 })
      return `<rect${attrs({ x: x + em(0.5), y: y - control.top + em(0.5), width: control.width - em(1), height: control.top + control.bottom - em(1), stroke: '#000', 'stroke-width': em(1), fill: 'none' })}/>` + this.text(control.text, x + (control.textInset ?? em(3.5)), y + nativeMusicAxis(this.measurer) + text.baseline - text.h / 2, nativeStyle.annotation, 'serif', { 'font-weight': 700 })
    }
    if (control.kind === 'passes') {
      const text = this.measurer.measureText(control.text, {fontSize:nativeStyle.small,fontFamily:'serif'})
      return this.text(control.text, x, y + nativeMusicAxis(this.measurer) + text.baseline - text.h / 2, nativeStyle.small, 'serif', {'data-m3n-role':'alternative-passes'})
    }
    if (control.kind === 'tempo') return this.tempo(control.text, x, y, control.tempoGeometry)
    if (control.kind === 'segno') return this.segno(x, y)
    if (control.kind === 'meter') {
      const meter = control.meterGeometry ?? nativeMeterGeometry(control.text, this.measurer)
      return this.text(meter.numerator, x + control.width / 2, y + meter.numeratorBaseline, nativeStyle.meter, 'M3N Numbers', { 'text-anchor': 'middle' })
        + `<rect${attrs({ x, y: y + meter.lineY, width: control.width, height: meter.lineHeight, fill: '#000' })}/>`
        + this.text(meter.denominator, x + control.width / 2, y + meter.denominatorBaseline, nativeStyle.meter, 'M3N Numbers', { 'text-anchor': 'middle' })
    }
    const geometry = nativeKeyGeometry(control.keyRows ?? [{key:control.text}],this.measurer)
    const axis = nativeMusicAxis(this.measurer)
    return geometry.rows.map(row => {
      const left = x+row.x, baseline = y+axis-geometry.height/2+row.y+row.baseline
      return this.text(row.prefix,left,baseline,nativeStyle.text,'M3N Numbers')
        + `<g transform="translate(${n(left+row.accidentalX)} ${n(baseline)})">`
        + row.paths.map(symbol=>`<path${attrs({d:symbol.d,fill:'none',stroke:'#000','stroke-width':symbol.stroke,'data-m3n-symbol':symbol.symbol,'stroke-linecap':'round','stroke-linejoin':'round'})}/>`).join('') + '</g>'
        + this.text(row.name,left+row.nameX,baseline,nativeStyle.text,'M3N Numbers')
    }).join('')
  }

  rawMark(mark: string): string {
    if (mark === 'tip' || mark === 'brk') return `<path${attrs({ d: nativeDesignPath('M-2.5 0 h5 l-2.5 7 Z'), fill: '#000' })}/>`
    if (mark === 'hold') return `<rect${attrs({ x: -em(7.7538) / 2, y: 0, width: em(7.7538), height: em(1.26), fill: '#000' })}/>`
    return this.mark(mark, 0, 0)
  }
}
