import { scoreLayoutConfig } from '../score-layout-config.js'

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

/** Readability loss grows from zero at the largest font to 4 at the smallest. */
export function scoreNumberedFontCost(width: number) {
  const config = scoreLayoutConfig.pageWidth
  const minimum = config.unit * config.minimumMultiple, maximum = config.unit * config.maximumMultiple
  return 4 * Math.max(0, (width - minimum) / (maximum - minimum)) ** 2
}

/** Break diagnostics and font/overflow costs; final physical spacing is scored separately. */
export function scoreNumberedCost(width: number, densities: readonly number[]) {
  const stretches = densities.map(density => Math.max(0, 1 - density))
  const mean = stretches.reduce((sum, stretch) => sum + stretch, 0) / Math.max(1, stretches.length)
  const lineStretchCost = stretches.reduce((sum, stretch) => sum + stretch ** 2, 0)
  const lineUniformityCost = stretches.reduce((sum, stretch) => sum + (stretch - mean) ** 2, 0)
  const overflowCost = densities.reduce((sum, density) => sum + 100 * Math.max(0, density - 1) ** 2, 0)
  const layoutCost = lineStretchCost + lineUniformityCost + overflowCost
  const fontSizeCost = scoreNumberedFontCost(width)
  return { lineStretchCost, lineUniformityCost, overflowCost, layoutCost, fontSizeCost }
}

/** Shared physical spacing objective; 16px is common to both minimum tiers. */
export function scoreNumberedSpacing(gaps: readonly number[], referenceGap = 16) {
  if (!gaps.length) return { meanRhythmicGap: 0, spacingUnevenCost: 0, spacingMeanUnevenCost: 0, spacingWorstUnevenCost: 0, spacingCrampedCost: 0, spacingExpandedCost: 0, spacingCost: 0 }
  const meanRhythmicGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
  const denominator = Math.max(Number.EPSILON, meanRhythmicGap) ** 2
  const deviations = gaps.map(gap => (gap - meanRhythmicGap) ** 2 / denominator)
  const spacingMeanUnevenCost = deviations.reduce((sum, value) => sum + value, 0) / gaps.length
  const spacingWorstUnevenCost = Math.max(...deviations)
  const spacingUnevenCost = spacingMeanUnevenCost + spacingWorstUnevenCost
  const spacingCrampedCost = gaps.reduce((sum, gap) => sum + (referenceGap / Math.max(Number.EPSILON, gap)) ** 2, 0) / gaps.length
  // Crowding alone rewards unbounded whitespace and therefore extra rows.
  // The common readable reference caps that reward; the same factor four
  // used by the existing horizontal quality policy penalizes excess spread.
  const spacingExpandedCost = 4 * gaps.reduce((sum, gap) => sum + Math.max(0, (gap / referenceGap) ** 2 - 1), 0) / gaps.length
  return { meanRhythmicGap, spacingUnevenCost, spacingMeanUnevenCost, spacingWorstUnevenCost, spacingCrampedCost, spacingExpandedCost,
    spacingCost: spacingUnevenCost + spacingCrampedCost + spacingExpandedCost }
}
