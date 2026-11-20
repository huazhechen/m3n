import { bravuraGlyph, type BravuraGlyph } from './bravura.js'
import { nativePathInk } from './native-ink.js'
const shapes: Record<string, BravuraGlyph> = { '♭': 'accidentalFlat', '♮': 'accidentalNatural', '♯': 'accidentalSharp' }
const height = (symbol: string, size: number) => (symbol === '♯' ? .78 : .82) * size * .72
export function nativeAccidentalAdvance(symbols: string, size: number): number {
  return [...symbols].reduce((sum, symbol) => sum + (shapes[symbol] ? bravuraGlyph(shapes[symbol]!, height(symbol, size)).width + size * .035 : 0), 0)
}
export function nativeAccidentalGeometry(symbols: string, size: number, numberHalfWidth: number) {
  const advance = nativeAccidentalAdvance(symbols, size)
  let left = -numberHalfWidth - advance
  const paths: { symbol: string; d: string; stroke: number }[] = []
  for (const symbol of symbols) {
    const name = shapes[symbol]
    if (!name) continue
    const shape = bravuraGlyph(name, height(symbol, size))
    const top = -size * .42 - (symbol === '♯' ? .63 : .67) * size * .72
    let coordinate = 0
    const d = shape.path.replace(/[MLCZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)/g, token => {
      if (/^[MLCZ]$/.test(token)) { coordinate = 0; return token }
      return String(Number((Number(token) + (coordinate++ % 2 ? top : left)).toFixed(6)))
    })
    paths.push({ symbol, d, stroke: 0 })
    left += nativePathInk(shape.path).right + size * .035
  }
  return { advance, paths }
}
