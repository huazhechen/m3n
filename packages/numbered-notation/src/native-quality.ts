import { scoreLineQuality, scoreNumberedCost, scoreNumberedSpacing } from './layout-quality.js'
import type { NativeLayout } from './native-layout.js'

export function nativeLayoutQuality(layout: Pick<NativeLayout, 'options' | 'margin' | 'systems' | 'pages'>) {
  const width = layout.options.width
  const available = Math.max(1, width - layout.margin * 2)
  const densities = layout.systems.map(system => system.horizontalDensity ?? system.measures.reduce((sum, measure) => sum + measure.minimum, 0) / available)
  const lastSystem = layout.systems.at(-1)
  const lastMeasure = lastSystem?.measures.at(-1)
  const rightEdge = width - layout.margin
  const lastLineSlack = lastMeasure ? Math.max(0, Math.min(1, (rightEdge - lastMeasure.end) / available)) : 0
  const costs = scoreNumberedCost(width, densities)
  const spacing = scoreNumberedSpacing(layout.systems.flatMap(system => system.unitRhythmicGap === undefined ? [] : [system.unitRhythmicGap]))
  return { ...costs, ...spacing, totalCost: spacing.spacingCost + costs.overflowCost + costs.fontSizeCost, pageCount: layout.pages.length, ...scoreLineQuality(densities, lastLineSlack) }
}


/** Compatibility quality is a monotone transform of the additive total cost. */
export function nativeLayoutScore(layout: Pick<NativeLayout, 'options' | 'margin' | 'systems' | 'pages'>) {
  const quality = nativeLayoutQuality(layout)
  return 1 / (1 + quality.totalCost)
}
