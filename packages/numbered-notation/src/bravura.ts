import outlines from './bravura-glyphs.json'
import { nativePathInk } from './native-ink.js'

export type BravuraGlyph = keyof typeof outlines
const cache = new Map<string, { path: string; width: number; height: number }>()

/** Bravura outlines, with the same exact extrema for measurement and SVG/PDF. */
export function bravuraGlyph(name: BravuraGlyph, height: number, centered = false) {
  const key = `${name}:${height}:${centered}`, saved = cache.get(key)
  if (saved) return saved
  const source = outlines[name], box = nativePathInk(source), scale = height / (box.bottom - box.top)
  const origin = centered ? (box.left + box.right) / 2 : box.left
  let coordinate = 0
  const path = source.replace(/[MLCZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)/g, token => {
    if (/^[MLCZ]$/.test(token)) { coordinate = 0; return token }
    return String(Number(((Number(token) - (coordinate++ % 2 ? box.top : origin)) * scale).toFixed(6)))
  })
  const result = { path, width: (box.right - box.left) * scale, height }
  cache.set(key, result)
  return result
}

export function bravuraSvg(name: BravuraGlyph, height: number) {
  return `<path d="${bravuraGlyph(name, height, true).path}" fill="#000" data-m3n-font="Bravura"/>`
}
