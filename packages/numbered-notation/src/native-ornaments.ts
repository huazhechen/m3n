import { nativeStyle } from './native-style.js'
import { nativeOrnamentOutlines } from './native-ornament-outlines.js'
import { nativePathInk, unionNativeInk } from './native-ink.js'

const cache = new Map<string, string>()

/** Normalize actual curve extrema, then bake a centered filled silhouette.
 * The design size follows the common music scale; it is not an occupied box.
 * Callers measure the returned paths for all placement and clearance. */
export function nativeOrnamentSvg(name: string, size = nativeStyle.small): string | undefined {
  if (name !== 'tr' && name !== 'prall') return undefined
  const key = `${name}:${size}`, cached = cache.get(key)
  if (cached) return cached
  const paths = nativeOrnamentOutlines[name], ink = unionNativeInk(paths.map(nativePathInk))
  const height = size * (name === 'prall' ? .55 : 1), scale = height / (ink.bottom - ink.top)
  const center = (ink.left + ink.right) / 2
  const svg = paths.map(path => {
    let coordinate = 0
    const d = path.replace(/[MLCZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)/g, token => {
      if (/^[MLCZ]$/.test(token)) { coordinate = 0; return token }
      const value = Number(token) - (coordinate++ % 2 ? ink.top : center)
      return String(Number((value * scale).toFixed(6)))
    })
    return `<path d="${d}" fill="#000"/>`
  }).join('')
  cache.set(key, svg)
  return svg
}
