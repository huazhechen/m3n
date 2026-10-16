import type { M3NAnalysisSnapshot } from '@m3n/notation'

export type AnalysisRequest = { revision: number; source: string }
export type AnalysisResponse = { revision: number } & ({ snapshot: M3NAnalysisSnapshot } | { error: string })
