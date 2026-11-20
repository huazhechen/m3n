import { nativeStyle } from './native-style.js'
import { nativeSvgInk, type NativeInk } from './native-ink.js'
import type { TextMeasurer } from './native-measure.js'
import { bravuraGlyph } from './bravura.js'

/** Repeat Bravura's arpeggio segment, rotated into the chord's vertical span. */
export function nativeArpeggioGeometry(host: NativeInk, measurer: TextMeasurer) {
  const size = nativeStyle.music, gap = size * .16
  const height = host.bottom - host.top
  const count = Math.max(1, Math.ceil(height / (size * .5))), step = height / count
  const shape = bravuraGlyph('wiggleArpeggiatoUp', 10), scale = step / shape.width
  const x = host.left - gap
  const paths: string[] = []
  for (let index = 0; index < count; index++) {
    // Transform coordinate pairs together: x' = x - y*s; y' = top + x*s.
    let op = '', values: number[] = [], path = ''
    const flush = () => { if (!op) return; path += op; for (let i = 0; i < values.length; i += 2) path += `${Number((x - values[i + 1]! * scale).toFixed(6))} ${Number((host.top + index * step + values[i]! * scale).toFixed(6))} `; values = [] }
    for (const token of shape.path.match(/[MLCZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)/g)!) {
      if (/^[MLCZ]$/.test(token)) { flush(); op = token } else values.push(Number(token))
    }
    flush()
    paths.push(`<path d="${path}" fill="#000" data-m3n-font="Bravura"/>`)
  }
  const svg = `<g data-m3n-role="arpeggio">${paths.join('')}</g>`
  return { svg, ink: nativeSvgInk(svg, measurer), gap }
}
