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

/** Each normalized interval gets one comfort vote, including zero-cost samples.
 * Uniformity compares the rows' inherited rhythmic gaps, so musical variation
 * inside a row does not masquerade as an uneven line break. Mean + worst row
 * deviation keep an isolated stretched row visible even in a long score. */
export function scoreNumberedSpacing(gaps: readonly number[], referenceGap = 16, tightGap = referenceGap / 2, rowGaps: readonly number[] = gaps) {
  if (!gaps.length) return { meanRhythmicGap: 0, spacingUnevenCost: 0, spacingMeanUnevenCost: 0, spacingWorstUnevenCost: 0, spacingCrampedCost: 0, spacingExpandedCost: 0, spacingCost: 0 }
  const lower = (tightGap + referenceGap) / 2, upper = referenceGap * 1.5
  let gapSum=0, crampedSum=0, expandedSum=0
  for (const gap of gaps) {
    gapSum+=gap
    crampedSum+=Math.max(0,lower/Math.max(Number.EPSILON,gap)-1)**2
    expandedSum+=Math.max(0,gap/upper-1)**2
  }
  const meanRhythmicGap = gapSum / gaps.length
  const meanRowGap = rowGaps.reduce((sum, gap) => sum + gap, 0) / Math.max(1, rowGaps.length)
  const denominator = Math.max(Number.EPSILON, meanRowGap) ** 2
  let deviationSum=0,spacingWorstUnevenCost=0
  for(const gap of rowGaps) {
    const deviation=(gap-meanRowGap)**2/denominator
    deviationSum+=deviation
    spacingWorstUnevenCost=Math.max(spacingWorstUnevenCost,deviation)
  }
  const spacingMeanUnevenCost = deviationSum / Math.max(1, rowGaps.length)
  const spacingUnevenCost = spacingMeanUnevenCost + spacingWorstUnevenCost
  const spacingCrampedCost = crampedSum / gaps.length
  const spacingExpandedCost = expandedSum / gaps.length
  return { meanRhythmicGap, spacingUnevenCost, spacingMeanUnevenCost, spacingWorstUnevenCost, spacingCrampedCost, spacingExpandedCost,
    spacingCost: spacingUnevenCost + 4 * spacingCrampedCost + spacingExpandedCost }
}
