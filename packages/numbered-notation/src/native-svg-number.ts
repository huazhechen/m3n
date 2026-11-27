/** Preserve measured subpixel geometry through nested SVG transforms. */
export function nativeSvgNumber(value: number): number {
  if (Number.isInteger(value)) return value === 0 ? 0 : value
  const scaled = value * 1_000_000
  // Already quantized coordinates are common when ink is measured repeatedly.
  // Below this bound multiplication cannot round a half-unit onto an integer.
  // Divide again to preserve toFixed's canonical decimal, including -0.
  if (Number.isInteger(scaled) && Math.abs(scaled) < 2 ** 51) return scaled === 0 ? (value < 0 ? -0 : 0) : scaled / 1_000_000
  if (Math.abs(scaled) < 2 ** 51) {
    const rounded = Math.round(scaled)
    // Multiplication by 10^6 can cross a decimal half-unit only within its
    // floating-point error bound. Outside that band, integer rounding and
    // division produce exactly the decimal that toFixed would parse. Keep the
    // original conversion for ties and adjacent floats, including negative ties.
    if (Math.abs(scaled - rounded) + Math.abs(scaled) * Number.EPSILON < .5)
      return rounded === 0 && value < 0 ? -0 : rounded / 1_000_000
  }
  return Number(value.toFixed(6))
}
