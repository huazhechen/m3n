import catalog, { loadScoreSource } from 'virtual:m3n-score-catalog'
import { preloadScoreFonts } from './preload-score-fonts'
export { initializeCatalog } from 'virtual:m3n-score-catalog'

export type PresetScore = (typeof catalog)[number]
export const presetScores: PresetScore[] = catalog

export async function loadPresetScore(slug: string): Promise<string | null> {
  const score = presetScores.find(score => score.slug === slug)
  if (!score) return null
  // Start the catalog-selected fonts before awaiting the source. FontFace uses
  // the same URLs after parsing, reusing these concurrent downloads.
  preloadScoreFonts(score.fontPreloads)
  return loadScoreSource(score)
}
