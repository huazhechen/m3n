import { scoreLayoutConfig } from './score-layout-config.js'

/** Dimensionless horizontal quality shared by both notation engines. */
export function scoreLineQuality(densities: readonly number[], lastLineSlack: number) {
  const mean = densities.reduce((sum, value) => sum + value, 0) / Math.max(1, densities.length)
  const variation = Math.sqrt(densities.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, densities.length)) / Math.max(mean, Number.EPSILON)
  // The line-ending policy permits 1.5 times the inherited rhythmic stretch.
  // Use the same bound for whole-score quality, so uniformly loose rows do
  // not look perfect merely because their variation is zero. An intentionally
  // shortened final row is evaluated within its actual target width.
  const lineStretchPenalty = densities.length < 2 ? 0 : densities.reduce((sum, density, index) => {
    const targetRatio = index === densities.length - 1 ? Math.max(Number.EPSILON, 1 - lastLineSlack) : 1
    return sum + Math.max(0, 1 - 1.5 * density / targetRatio) ** 2
  }, 0) / densities.length
  return { meanLineDensity: mean, lineDensityVariation: variation, lastLineSlack, lineStretchPenalty }
}

/** The width factor only compares sizes within the same notation design. */
export function scoreHorizontalQuality(width: number, quality: { lineDensityVariation: number; lastLineSlack: number; lineStretchPenalty?: number }) {
  const minimumWidth = scoreLayoutConfig.pageWidth.unit * scoreLayoutConfig.pageWidth.minimumMultiple
  return (minimumWidth / width) ** 2 / (1 + quality.lineDensityVariation + 0.5 * quality.lastLineSlack + 4 * (quality.lineStretchPenalty ?? 0))
}
