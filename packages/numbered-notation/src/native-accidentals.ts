import { nativeSvgNumber as n } from './native-svg-number.js'
/** Font-independent music symbols, positioned relative to a number's baseline.
 * A common stroke grid keeps small grace notes and full-size notes consistent.
 */
const dimensions: Record<string, { width: number; height: number; baseline: number }> = {
  '♯': { width: 0.46, height: 0.78, baseline: 0.63 },
  '♭': { width: 0.38, height: 0.82, baseline: 0.67 },
  '♮': { width: 0.42, height: 0.82, baseline: 0.67 },
}

export function nativeAccidentalAdvance(symbols: string, size: number): number {
  return [...symbols].reduce((sum, symbol) => sum + (dimensions[symbol] ? dimensions[symbol]!.width * size * 0.72 + size * 0.01 : 0), 0)
}

export function nativeAccidentalGeometry(symbols: string, size: number, numberHalfWidth: number) {
  const advance = nativeAccidentalAdvance(symbols, size)
  let left = -numberHalfWidth - advance
  const paths: { symbol: string; d: string; stroke: number }[] = []
  for (const symbol of symbols) {
    const shape = dimensions[symbol]
    if (!shape) continue
    const width = shape.width * size * 0.72, height = shape.height * size * 0.72
    const top = -size * 0.42 - shape.baseline * size * 0.72
    const p = (x: number, y: number) => `${n(left + x * width)} ${n(top + y * height)}`
    const segments: string[] = []
    const stroke = (x1: number, y1: number, x2: number, y2: number) => segments.push(`M${p(x1, y1)} L${p(x2, y2)}`)
    if (symbol === '♯') {
      stroke(0.34, 0.05, 0.27, 0.95)
      stroke(0.72, 0.05, 0.65, 0.95)
      stroke(0.08, 0.38, 0.9, 0.28)
      stroke(0.05, 0.72, 0.87, 0.62)
    } else if (symbol === '♭') {
      stroke(0.3, 0.04, 0.3, 0.94)
      segments.push(`M${p(0.3, 0.5)} Q${p(0.92, 0.36)} ${p(0.76, 0.68)} Q${p(0.63, 0.87)} ${p(0.3, 0.86)}`)
    } else {
      segments.push(`M${p(0.28, 0.05)} L${p(0.28, 0.82)} L${p(0.72, 0.68)} L${p(0.72, 0.95)}`)
      segments.push(`M${p(0.72, 0.95)} L${p(0.72, 0.18)} L${p(0.28, 0.32)}`)
    }
    paths.push({ symbol, d: segments.join(' '), stroke: size * 0.06 })
    left += width + size * 0.01
  }
  return { advance, paths }
}
