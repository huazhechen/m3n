import type { ScoreWidthCandidatePolicy } from '@m3n/numbered-notation/layout'
import type { ScoreDocument } from '@m3n/notation'
import type { PreparedNumberedNotationScore, NumberedNotationRenderOptions } from '@m3n/numbered-notation'
import type { WidthMeasurement } from '../scorebook-width.mjs'
export type WidthTimings = Record<string, number | Record<string, number>>
export function measureNumberedWidth(documentScore: ScoreDocument, width: number, options?: {
  auditLayout?: boolean; candidatePolicy?:ScoreWidthCandidatePolicy; detailedTimings?: boolean; minimumQuality?: number; maximumPageCount?: number; signal?: AbortSignal; paged?: boolean; settings?: Partial<NumberedNotationRenderOptions>; host?: HTMLElement; afterMount?: (host: HTMLElement) => void
}): { candidate: WidthMeasurement & { timings: WidthTimings }; prepared: PreparedNumberedNotationScore }
