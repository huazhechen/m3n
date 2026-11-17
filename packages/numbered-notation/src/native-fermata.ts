import { nativeStyle } from './native-style.js'
import { nativePathInk } from './native-ink.js'

// Project fermata contour, independent of the reference layout/runtime.
const contour = 'M0 7.46666 C3.65834 0 8.53611 0 12.19445 7.46666 M12.19445 7.46666 C8.53611 0.74666 3.65833 0.74666 0 7.46666'
const bounds = nativePathInk(contour)
const bottom = Math.max(bounds.bottom, 6.26666 + 1.2)
const top = Math.min(bounds.top, 6.26666 - 1.2)

/** Keep the authored shape height; callers measure the scaled stroke as ink. */
export function nativeFermataSvg(size = nativeStyle.small): string {
  const scale = size * .6 / (bottom - top), center = (bounds.left + bounds.right) / 2
  let coordinate = 0
  const n = (value: number) => Number(value.toFixed(6))
  const d = contour.replace(/[MLC]|[-+]?(?:\d*\.\d+|\d+\.?\d*)/g, token => {
    if (/^[MLC]$/.test(token)) { coordinate = 0; return token }
    return String(n((Number(token) - (coordinate++ % 2 ? top : center)) * scale))
  })
  return `<path d="${d}" fill="#000" stroke="#000" stroke-width="${n(scale)}"/>`
    + `<circle cx="${n((6.09723-center)*scale)}" cy="${n((6.26666-top)*scale)}" r="${n(1.2*scale)}" fill="#000"/>`
}
