import { nativeStyle } from './native-style.js'
import { attrs, n } from './native-symbols.js'
import { nativeSvgInk, type NativeInk } from './native-ink.js'
import type { TextMeasurer } from './native-measure.js'

/** Independently drawn wave; its stroke fits the measured chord's vertical span. */
export function nativeArpeggioGeometry(host: NativeInk, measurer: TextMeasurer) {
  const size = nativeStyle.music, stroke = size * 0.055, amplitude = size * 0.09, gap = size * 0.16
  const height = host.bottom - host.top
  const count = Math.max(1, Math.round(height / (size * 0.4))) * 2
  const step = Math.max(0, height - stroke) / count
  const x = host.left - gap - amplitude - stroke / 2, top = host.top + stroke / 2
  let d = `M${n(x)} ${n(top)}`
  for (let index = 0; index < count; index++) {
    const y = top + index * step, controlX = x + (index % 2 ? 1 : -1) * amplitude * 4 / 3
    d += ` C${n(controlX)} ${n(y + step / 3)} ${n(controlX)} ${n(y + 2 * step / 3)} ${n(x)} ${n(y + step)}`
  }
  const svg = `<path${attrs({ d, fill: 'none', stroke: '#000', 'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'data-m3n-role': 'arpeggio' })}/>`
  return { svg, ink: nativeSvgInk(svg, measurer), gap }
}
