declare module 'virtual:m3n-score-catalog' {
  const scores: Array<import('@m3n/notation').PresetScoreMetadata & { sourcePath: string; category?: { id: string; title: string; order: number; itemOrder: number } }>
  export default scores
}
