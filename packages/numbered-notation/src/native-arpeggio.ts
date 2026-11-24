import { nativeStyle } from './native-style.js'
import { nativeSvgInk, type NativeInk } from './native-ink.js'
import type { TextMeasurer } from './native-measure.js'
import { bravuraGlyph } from './bravura.js'
import { nativeMatrix } from './native-transform.js'

/** Repeat Bravura's arpeggio segment, rotated into the chord's vertical span. */
export function nativeArpeggioGeometry(host: NativeInk, measurer: TextMeasurer) {
  const size = nativeStyle.music, gap = size * .16
  const height = host.bottom - host.top
  const count = Math.max(1, Math.ceil(height / (size * .5))), step = height / count
  const shape = bravuraGlyph('wiggleArpeggiatoUp', 10, false, measurer), scale = step / shape.width
  const x = host.left - gap
  const paths: string[] = []
  for (let index = 0; index < count; index++) {
    const matrix = nativeMatrix(0,scale,-scale,0,x,host.top+index*step)
    paths.push(`<g transform="matrix(${matrix.join(' ')})">${shape.svg}</g>`)
  }
  const svg = `<g data-m3n-role="arpeggio">${paths.join('')}</g>`
  return { svg, ink: nativeSvgInk(svg, measurer), gap }
}
