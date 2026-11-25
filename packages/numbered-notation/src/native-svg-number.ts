/** Preserve measured subpixel geometry through nested SVG transforms. */
export function nativeSvgNumber(value: number): number {
  if (Number.isInteger(value)) return value === 0 ? 0 : value
  const scaled = value * 1_000_000
  // Already quantized coordinates are common when ink is measured repeatedly.
  // Below this bound multiplication cannot round a half-unit onto an integer.
  // Divide again to preserve toFixed's canonical decimal, including -0.
  if (Number.isInteger(scaled) && Math.abs(scaled) < 2 ** 51) return scaled === 0 ? (value < 0 ? -0 : 0) : scaled / 1_000_000
  return Number(value.toFixed(6))
}
