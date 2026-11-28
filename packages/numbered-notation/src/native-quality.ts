import { scoreLineQuality, scoreNumberedCost, scoreNumberedSpacing } from './layout/quality.js'
import type { NativeLayout } from './native-layout-model.js'
import { scoreLayoutConfig } from './score-layout-config.js'

export function nativeLayoutQuality(layout: Pick<NativeLayout, 'options' | 'margin' | 'systems' | 'pages' | 'verticalCost'>) {
  const width = layout.options.width
  const available = Math.max(1, width - layout.margin * 2)
  const densities = layout.systems.map(system => system.horizontalDensity ?? system.measures.reduce((sum, measure) => sum + measure.minimum, 0) / available)
  const lastSystem = layout.systems.at(-1)
  const lastMeasure = lastSystem?.measures.at(-1)
  const rightEdge = width - layout.margin
  const lastLineSlack = lastMeasure ? Math.max(0, Math.min(1, (rightEdge - lastMeasure.end) / available)) : 0
  const costs = scoreNumberedCost(width, densities)
  const tight = scoreLayoutConfig.numbered.noteGapCandidates[0]!, loose = scoreLayoutConfig.numbered.noteGapCandidates.at(-1)!
  const spacing = scoreNumberedSpacing(layout.systems.flatMap(system => system.rhythmicGaps ?? []), loose, tight,
    layout.systems.flatMap(system => system.unitRhythmicGap === undefined ? [] : [system.unitRhythmicGap]))
  const verticalCost = layout.verticalCost ?? 0
  return { ...costs, ...spacing, verticalCost, totalCost: spacing.spacingCost + costs.overflowCost + costs.fontSizeCost + verticalCost, pageCount: layout.pages.length, ...scoreLineQuality(densities, lastLineSlack) }
}


/** Compatibility quality is a monotone transform of the additive total cost. */
export function nativeLayoutScore(layout: Pick<NativeLayout, 'options' | 'margin' | 'systems' | 'pages' | 'verticalCost'>) {
  const quality = nativeLayoutQuality(layout)
  return 1 / (1 + quality.totalCost)
}
