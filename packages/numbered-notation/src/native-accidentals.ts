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
    const p = (x: number, y: number) => `${Number((left + x * width).toFixed(4))} ${Number((top + y * height).toFixed(4))}`
    const segments: string[] = []
    const stroke = (x1: number, y1: number, x2: number, y2: number) => segments.push(`M${p(x1, y1)} L${p(x2, y2)}`)
    if (symbol === '♯') {
      // Parallel leaning stems crossed by two rising bars.
      for (const stem of [0.31, 0.69]) stroke(stem + 0.035, 0.05, stem - 0.035, 0.95)
      for (const bar of [0.33, 0.67]) stroke(0.065, bar + 0.05, 0.885, bar - 0.05)
    } else if (symbol === '♭') {
      stroke(0.3, 0.04, 0.3, 0.94)
      segments.push(`M${p(0.3, 0.5)} C${p(0.95, 0.35)} ${p(0.95, 0.75)} ${p(0.3, 0.86)}`)
    } else {
      const stemLeft = 0.28, stemRight = 1 - stemLeft
      stroke(stemLeft, 0.05, stemLeft, 0.82)
      stroke(stemRight, 0.18, stemRight, 0.95)
      stroke(stemLeft, 0.32, stemRight, 0.18)
      stroke(stemLeft, 0.82, stemRight, 0.68)
    }
    paths.push({ symbol, d: segments.join(' '), stroke: size * 0.06 })
    left += width + size * 0.01
  }
  return { advance, paths }
}
