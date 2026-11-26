export type WidthMeasurement = {
  width: number
  error?: string
  pageCount: number
  rows: number
  outside: unknown[]
  overlaps: unknown[]
  naturalHeight?: number
  lineDensityVariation?: number
  meanLineDensity?: number
  lineStretchPenalty?: number
  lastLineSlack?: number
  qualityScore?: number
}
export const widthMinimum: number, widthMaximum: number, widthStep: number
export const widthCandidates: number[]
export const widthSearchStrategy: string
export function chooseBestWidth(candidates: WidthMeasurement[]): WidthMeasurement | null
export function numberedLayoutScore(candidate: Pick<WidthMeasurement, 'width' | 'lineDensityVariation' | 'lastLineSlack' | 'lineStretchPenalty' | 'qualityScore'>): number
export class WidthSearchPruned extends Error {}
export function widthQualityUpperBound(width: number): number
export function widthCannotWin(width: number, best: Pick<WidthMeasurement, "width" | "pageCount" | "qualityScore" | "lineDensityVariation" | "lastLineSlack" | "lineStretchPenalty"> | null): boolean
export function probeWidthCandidates(measure: (width: number, best: WidthMeasurement | null) => Promise<WidthMeasurement>, options?: { signal?: AbortSignal; prune?: boolean; verify?: (width: number, measurement: WidthMeasurement) => Promise<Partial<WidthMeasurement>> }): Promise<{
  candidates: WidthMeasurement[]
  renderCache: { strategy: string; requests: number; uniqueWidths: number; hits: number; verifiedWidths: number; skippedWidths: number[] }
}>

export function selectBestWidth(measure: (width: number, best: WidthMeasurement | null) => Promise<WidthMeasurement>, options?: { signal?: AbortSignal; prune?: boolean; verify?: (width: number, measurement: WidthMeasurement) => Promise<Partial<WidthMeasurement>> }): Promise<{ candidates: WidthMeasurement[]; best: WidthMeasurement; renderCache: { strategy: string; requests: number; uniqueWidths: number; hits: number; verifiedWidths: number; skippedWidths: number[] } }>
