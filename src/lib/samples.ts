import catalog, { loadScoreSource } from 'virtual:m3n-score-catalog'
import { preloadScoreFonts } from './preload-score-fonts'
export { initializeCatalog } from 'virtual:m3n-score-catalog'

export type PresetScore = (typeof catalog)[number]
export const presetScores: PresetScore[] = catalog

export async function loadPresetScore(slug: string): Promise<string | null> {
  const score = presetScores.find(score => score.slug === slug)
  if (!score) return null
  preloadScoreFonts(score.fontPreloads)
  return loadScoreSource(score)
}
