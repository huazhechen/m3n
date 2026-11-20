declare module 'virtual:m3n-works-catalog' {
  type Work = import('@m3n/notation').PresetScoreMetadata & { sourceUrl: string; sourcePath: string; modifiedAt: number }
  export function getWorks(): Promise<Work[]>
  export function loadWorkSource(work: Work): Promise<string>
}

declare module 'virtual:m3n-score-catalog' {
  const scores: Array<import('@m3n/notation').PresetScoreMetadata & { sourceUrl: string; sourcePath: string; modifiedAt: number; category?: { id: string; title: string; order: number; itemOrder: number } }>
  export function initializeCatalog(): Promise<void>
  export function loadScoreSource(score: (typeof scores)[number]): Promise<string>
  export default scores
}
