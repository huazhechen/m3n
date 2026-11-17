declare module 'virtual:m3n-score-catalog' {
  const scores: Array<import('@m3n/notation').PresetScoreMetadata & { sourcePath: string; scorebookWidth?: number; category?: { id: string; title: string; order: number } }>
  export const scorebookDefaultWidth: number
  export default scores
}
