import type { NativeLayout } from './native-layout.js'

export function nativeLayoutQuality(layout: NativeLayout) {
  const width = layout.options.width
  const available = Math.max(1, width - layout.margin * 2)
  const densities = layout.systems.map(system => system.measures.reduce((sum, measure) => sum + measure.minimum, 0) / available)
  const mean = densities.reduce((sum, density) => sum + density, 0) / Math.max(1, densities.length)
  const variation = Math.sqrt(densities.reduce((sum, density) => sum + (density - mean) ** 2, 0) / Math.max(1, densities.length)) / Math.max(mean, Number.EPSILON)
  const lastSystem = layout.systems.at(-1)
  const lastMeasure = lastSystem?.measures.at(-1)
  const rightEdge = width - layout.margin
  const lastLineSlack = lastMeasure ? Math.max(0, Math.min(1, (rightEdge - lastMeasure.end) / available)) : 0
  return { pageCount: layout.pages.length, lineDensityVariation: variation, lastLineSlack }
}


/** Same font-size, density and final-line weighting as width selection. */
export function nativeLayoutScore(layout: NativeLayout) {
  const quality = nativeLayoutQuality(layout)
  return (480 / layout.options.width) / (1 + quality.lineDensityVariation + 0.5 * quality.lastLineSlack)
}
