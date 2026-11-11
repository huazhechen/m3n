import catalog from 'virtual:m3n-score-catalog'

export type PresetScore = (typeof catalog)[number]
export const presetScores: PresetScore[] = catalog

const scoreModules = import.meta.glob<string>('../scores/**/*.m3n', {
  query: '?raw',
  import: 'default',
})

export async function loadPresetScore(slug: string): Promise<string | null> {
  const score = presetScores.find(score => score.slug === slug)
  if (!score) return null
  const load = scoreModules[`../scores/${score.sourcePath}`]
  if (!load) throw new Error('内置乐谱正文缺失，请刷新页面重试。')
  return load()
}
