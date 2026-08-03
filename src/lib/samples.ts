import { scoreMetadataFromSource, type PresetScoreMetadata } from './score-metadata'

export type PresetScore = PresetScoreMetadata & { source: string }

const scoreModules = import.meta.glob('../scores/**/*.m3n', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

function slugFromPath(path: string) {
  return path.split('/').at(-1)?.replace(/\.m3n$/, '') ?? path
}

export const presetScores: PresetScore[] = Object.entries(scoreModules)
  .map(([path, source]) => ({
    ...scoreMetadataFromSource(slugFromPath(path), source),
    source,
  }))
  .sort((a, b) => a.melodyComplexity - b.melodyComplexity
    || a.title.localeCompare(b.title, 'zh-Hans-CN')
    || a.slug.localeCompare(b.slug))
