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
  // Average the unused bottom portion of every A4 content area. Horizontal
  // regularity alone can reward dropping a row and leaving a much emptier page.
  const pageBottomSlack = layout.pages.reduce((sum, page) => {
    const bottom = Math.max(layout.margin, ...page.systems.map(system => system.bottom))
    return sum + Math.max(0, Math.min(1, (page.height - layout.margin - bottom) / Math.max(1, page.height - layout.margin * 2)))
  }, 0) / Math.max(1, layout.pages.length)
  return { pageCount: layout.pages.length, lineDensityVariation: variation, lastLineSlack, pageBottomSlack }
}


/** Choose note spacing at a fixed width using horizontal density and slack.
 * Page-bottom slack belongs to width selection: using it here would increase
 * note gaps just to fill the page instead of allowing a narrower candidate. */
export function nativeLayoutScore(layout: NativeLayout) {
  const quality = nativeLayoutQuality(layout)
  return (480 / layout.options.width) / (1 + quality.lineDensityVariation + 0.5 * quality.lastLineSlack)
}
