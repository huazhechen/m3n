import type { M3NAnalysis } from '@m3n/notation'

export type AnalysisRequest = { revision: number; source: string }
export type AnalysisResponse = { revision: number } & ({ snapshot: M3NAnalysis } | { error: string })
