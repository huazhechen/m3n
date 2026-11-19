import catalog, { loadScoreSource } from 'virtual:m3n-score-catalog'
export { initializeCatalog } from 'virtual:m3n-score-catalog'

export type PresetScore = (typeof catalog)[number]
export const presetScores: PresetScore[] = catalog

export async function loadPresetScore(slug: string): Promise<string | null> {
  const score = presetScores.find(score => score.slug === slug)
  if (!score) return null
  return loadScoreSource(score)
}
