import { nativeDesignPath } from './native-style.js'
import { nativePathInk, unionNativeInk } from './native-ink.js'

/** Authored calligraphic ornaments on the common music-size grid. These are
 * filled silhouettes so font substitution and stroke joins cannot change them.
 * Callers measure the returned painted paths, rather than reserving this grid.
 */
function silhouette(designs: string[]) {
  const paths = designs.map(nativeDesignPath)
  const ink = unionNativeInk(paths.map(nativePathInk))
  const offset = Number((-(ink.left+ink.right)/2).toFixed(4))
  return `<g transform="translate(${offset} 0)">${paths.map(d => `<path d="${d}" fill="#000"/>`).join('')}</g>`
}

export function nativeOrnamentSvg(name: string): string | undefined {
  if (name === 'tr') {
    // Slanted t with a returning foot; r has a separate shoulder and round tip.
    const t = 'M-2.1 0 L-3.3 4 H-0.7 L-1 4.9 H-3.6 L-5.1 9.5 C-5.6 11.1 -4.1 11.5 -2.1 9.3 L-1.6 9.8 C-3.7 12.4 -7.9 12.9 -6.8 9.5 L-5.3 4.9 H-7.8 L-7.5 4 H-5 L-3.8 0 Z'
    const r = 'M-1.1 5.4 C0.1 3.8 2.7 3.3 2.8 4.9 L2.7 5.6 C4.1 3.6 6.3 3.3 7.2 4.4 C8.2 5.8 6.5 7.5 5.6 6.5 C5.2 6 5.7 5.3 6.1 4.9 C5 4.5 3.3 6.3 2.7 7.8 L1.4 12 H-0.6 L1.5 5.5 C1.8 4.5 0.6 4.9 -0.6 6.1 Z'
    return silhouette([t,r])
  }
  if (name === 'prall') {
    // Two joined tapered zigzags, rather than a thin constant-width polyline.
    const d = 'M-6.6 4.5 L-3.8 0 L-0.8 3.3 L1.4 0 L4.5 3.5 L6 1.5 L6.6 2 L3.8 6.6 L0.8 3.3 L-1.4 6.6 L-4.5 3.1 L-6 5.1 Z'
    return silhouette([d])
  }
  return undefined
}
