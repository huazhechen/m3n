import { presetScoreIndex } from '../scores/index'
import type { PresetScoreMetadata } from './score-metadata'

export type PresetScore = PresetScoreMetadata

const scoreModules = import.meta.glob('../scores/**/*.m3n', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

export const presetScores: PresetScore[] = [...presetScoreIndex]
  .sort((a, b) => a.melodyComplexity - b.melodyComplexity || a.order - b.order || a.slug.localeCompare(b.slug))

export async function loadPresetScoreSource(slug: string) {
  const loader = scoreModules[`../scores/${slug}.m3n`]
  return loader?.() ?? null
}
