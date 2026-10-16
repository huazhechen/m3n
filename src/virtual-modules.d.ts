declare module 'virtual:m3n-score-catalog' {
  const scores: Array<import('@m3n/notation').PresetScoreMetadata & { sourcePath: string }>
  export default scores
}
