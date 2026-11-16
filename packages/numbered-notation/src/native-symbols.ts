import { nativeNoteBody } from './native-note-body.js'
import { nativeMusicAxis } from './native-axis.js'
import { nativeMeterGeometry } from './native-meter.js'
import { nativeStyle, nativeEm as em, nativeDesignPath } from './native-style.js'
import type { TextMeasurer } from './native-measure.js'
import type { NativePitch, NativeControl } from './native-model.js'
import { nativeKeyGeometry } from './native-key.js'
import { nativeAccidentalGeometry } from './native-accidentals.js'
import { nativeOrnamentSvg } from './native-ornaments.js'

export const xml = (value: string | number) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
export const n = (value: number) => Number(value.toFixed(4))
export function attrs(values: Record<string, string | number | undefined>) { return Object.entries(values).filter(([, value]) => value !== undefined).map(([name, value]) => ` ${name}="${xml(typeof value === 'number' ? n(value) : value!)}"`).join('') }
export const line = (x1: number, y1: number, x2: number, y2: number, width = nativeStyle.stroke, extra = '') => `<line${attrs({ x1, y1, x2, y2, stroke: '#000', 'stroke-width': width })}${extra}/>`
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
        + symbols.paths.map(symbol => `<path${attrs({ d: symbol.d, fill: 'none', stroke: '#000', 'stroke-width': symbol.stroke, 'data-m3n-symbol': symbol.symbol })}/>`).join('') + '</g>'
    }
    const body = nativeNoteBody(this.measurer, size)
    for (let index = 0; index < Math.abs(pitch.octave); index++) {
      const offset = body.octaveY(pitch.octave > 0, index, beams)
      svg += circle(x, y + offset, size * 0.075)
    }
    return svg
  }

  tempo(text: string, x: number, y: number): string {
    const eighth = text.startsWith('♪'), value = text.replace(/^[♪♩]\s*/, '')
    let svg = `<ellipse${attrs({ cx: x + em(4), cy: y - em(4), rx: em(4), ry: em(2.6), fill: '#000' })}/>` + line(x + em(7), y - em(5), x + em(7), y - em(21), nativeStyle.symbolStroke)
    if (eighth) svg += path(`M${n(x + em(7))} ${n(y - em(21))} ${nativeDesignPath('q10 4 5 11 q2 -6 -5 -7')}`, '#000')
    return svg + this.text(value, x + em(20), y, nativeStyle.text, 'M3N Numbers')
  }

  segno(x: number, y: number): string {
    const curve = path(nativeDesignPath('M10 2 C0 -2 -1 7 7 9 C15 11 14 20 4 17 M1 18 L13 0')) + circle(em(1.7), em(6), em(1)) + circle(em(12.3), em(12), em(1))
    return `<g transform="translate(${n(x)} ${n(y - em(15.8))})">${curve}</g>`
  }

  mark(mark: string, x: number, y: number): string {
    if (mark === 'fermata') return path(`M${n(x - em(7))} ${n(y - em(1))} Q${n(x)} ${n(y - em(15))} ${n(x + em(7))} ${n(y - em(1))}`) + circle(x, y - em(3))
    const ornament = nativeOrnamentSvg(mark)
    if (ornament !== undefined) return `<g transform="translate(${n(x)} ${n(y)})">${ornament}</g>`
    if (mark === 'breath') return this.text('’', x, y, nativeStyle.text, 'serif', { 'text-anchor': 'middle' })
    return this.text(/^f[1-5]$/.test(mark) ? mark.slice(1) : mark, x, y, /^f[1-5]$/.test(mark) ? nativeStyle.music * 0.5 : nativeStyle.grace, 'serif', { 'text-anchor': 'middle', 'font-style': /^(p{1,3}|f{1,3}|mp|mf|sfz)$/.test(mark) ? 'italic' : undefined })
  }

  control(control: NativeControl, x = 0, y = 0): string {
    if (control.kind === 'section') return `<rect${attrs({ x: x + em(0.5), y: y - control.top + em(0.5), width: control.width - em(1), height: control.top + control.bottom - em(1), stroke: '#000', 'stroke-width': em(1), fill: 'none' })}/>` + this.text(control.text, x + em(3.5), y - em(2.4), nativeStyle.annotation, 'serif', { 'font-weight': 700 })
    if (control.kind === 'passes') {
      const text = this.measurer.measureText(control.text, {fontSize:nativeStyle.small,fontFamily:'serif'})
      return this.text(control.text, x, y + nativeMusicAxis(this.measurer) + text.baseline - text.h / 2, nativeStyle.small, 'serif', {'data-m3n-role':'alternative-passes'})
    }
    if (control.kind === 'tempo') return this.tempo(control.text, x, y - em(2))
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
        + row.paths.map(symbol=>`<path${attrs({d:symbol.d,fill:'none',stroke:'#000','stroke-width':symbol.stroke,'data-m3n-symbol':symbol.symbol})}/>`).join('') + '</g>'
        + this.text(row.name,left+row.nameX,baseline,nativeStyle.text,'M3N Numbers')
    }).join('')
  }

  rawMark(mark: string): string {
    if (mark === 'tip' || mark === 'brk') return `<path${attrs({ d: nativeDesignPath('M-2.5 0 h5 l-2.5 7 Z'), fill: '#000' })}/>`
    if (mark === 'hold') return `<rect${attrs({ x: -em(7.7538) / 2, y: 0, width: em(7.7538), height: em(1.26), fill: '#000' })}/>`
    if (mark === 'str') return path(nativeDesignPath('M-5.4 0.6 L5.4 3 L-5.4 5.4'))
    return this.mark(mark, 0, 0)
  }
}
