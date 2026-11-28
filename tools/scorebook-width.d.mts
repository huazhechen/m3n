import type { ScoreWidthCandidatePolicy } from '@m3n/numbered-notation/layout'
export { optimizedScoreWidthPolicy } from '@m3n/numbered-notation/layout'
export type WidthMeasurement = {
  width: number
  error?: string
  pageCount: number
  rows: number
  outside: unknown[]
  overlaps: unknown[]
  minimumRowGap?: number
  naturalHeight?: number
  lineDensityVariation?: number
  meanLineDensity?: number
  lineStretchPenalty?: number
  lastLineSlack?: number
  qualityScore?: number
  lineStretchCost?: number
  lineUniformityCost?: number
  layoutCost?: number
  fontSizeCost?: number
  verticalCost?: number
  totalCost?: number
}
export const widthMinimum: number, widthMaximum: number, widthStep: number
export const widthCandidates: number[]
export const widthSearchStrategy: string
export function compareWidthMeasurements(a: WidthMeasurement, b: WidthMeasurement): number
export function chooseBestWidth(candidates: WidthMeasurement[]): WidthMeasurement | null
export function numberedLayoutScore(candidate: Pick<WidthMeasurement, 'width' | 'totalCost' | 'lineDensityVariation' | 'lastLineSlack' | 'lineStretchPenalty' | 'qualityScore'>): number
export class WidthSearchPruned extends Error { timings?: Record<string, number | Record<string, number>> }
export function widthQualityUpperBound(width: number, numbered?: boolean): number
export function widthCannotWin(width: number, best: Pick<WidthMeasurement, "width" | "totalCost" | "pageCount" | "qualityScore" | "lineDensityVariation" | "lastLineSlack" | "lineStretchPenalty"> | null, minimumPageCount?:number): boolean
export function probeWidthCandidates(measure: (width: number, best: WidthMeasurement | null, candidatePolicy?:ScoreWidthCandidatePolicy) => Promise<WidthMeasurement>, options?: { signal?: AbortSignal; prune?: boolean; candidatePolicy?:ScoreWidthCandidatePolicy; verify?: (width: number, measurement: WidthMeasurement) => Promise<Partial<WidthMeasurement>> }): Promise<{
  candidates: WidthMeasurement[]
  renderCache: { strategy: string; requests: number; uniqueWidths: number; hits: number; verifiedWidths: number; skippedWidths: number[]; estimatedSkippedWidths:number[]; tierRechecks:number }
}>

export function selectBestWidth(measure: (width: number, best: WidthMeasurement | null, candidatePolicy?:ScoreWidthCandidatePolicy) => Promise<WidthMeasurement>, options?: { signal?: AbortSignal; prune?: boolean; candidatePolicy?:ScoreWidthCandidatePolicy; verify?: (width: number, measurement: WidthMeasurement) => Promise<Partial<WidthMeasurement>> }): Promise<{ candidates: WidthMeasurement[]; best: WidthMeasurement; renderCache: { strategy: string; requests: number; uniqueWidths: number; hits: number; verifiedWidths: number; skippedWidths: number[]; estimatedSkippedWidths:number[]; tierRechecks:number } }>
export function verifyEstimatedWidthCandidates(candidates: WidthMeasurement[], measure: (width:number)=>WidthMeasurement|Promise<WidthMeasurement>, options?:{signal?:AbortSignal;verifyWidestWhenMultipage?:boolean}):Promise<{best:WidthMeasurement;requests:number;ms:number;verifiedCandidates:WidthMeasurement[];failures:{width:number;error:string}[]}>
