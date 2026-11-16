import { nativeDynamicOutlines } from './native-dynamic-outlines.js'
import { nativePathInk } from './native-ink.js'
import { nativeStyle } from './native-style.js'

const advance: Readonly<Record<string, number>> = { mf: 8.0028, mp: 9.523, ff: 6.67866, pp: 8.8083 }
const cache = new Map<string, Readonly<{ paths: readonly string[]; width: number; height: number }>>()

/** Compose the calligraphic letters, normalize their actual curve extrema and
 * bake a centered outline. Size is the f-family height; p has no ascender. */
export function nativeDynamicGlyph(name: string, size = nativeStyle.small) {
  if (!/^(p{1,3}|f{1,3}|mp|mf)$/.test(name)) return undefined
  const key = `${name}:${size}`, cached = cache.get(key)
  if (cached) return cached
  let dx = 0
  const letters = [...name].map((letter, index) => {
    const path = nativeDynamicOutlines[letter as keyof typeof nativeDynamicOutlines]
    const bounds = nativePathInk(path), offset = dx
    dx += advance[letter + name[index + 1]] ?? 0
    return { path, bounds, offset }
  })
  const left = Math.min(...letters.map(letter => letter.bounds.left + letter.offset))
  const right = Math.max(...letters.map(letter => letter.bounds.right + letter.offset))
  const top = Math.min(...letters.map(letter => letter.bounds.top))
  const bottom = Math.max(...letters.map(letter => letter.bounds.bottom))
  const height = size * (name.includes('f') ? 1 : .79341), scale = height / (bottom - top)
  const center = (left + right) / 2
  const paths = letters.map(letter => {
    let coordinate = 0
    return letter.path.replace(/[MLCZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)/g, token => {
      if (/^[MLCZ]$/.test(token)) { coordinate = 0; return token }
      const value = coordinate++ % 2 ? Number(token) - top : Number(token) + letter.offset - center
      return String(Number((value * scale).toFixed(6)))
    })
  })
  const glyph = { paths, width: (right - left) * scale, height }
  cache.set(key, glyph)
  return glyph
}
