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
export function probeWidthCandidates(measure: (width: number) => Promise<WidthMeasurement>, options?: { signal?: AbortSignal; verify?: (width: number, measurement: WidthMeasurement) => Promise<Partial<WidthMeasurement>> }): Promise<{
  candidates: WidthMeasurement[]
  renderCache: { strategy: string; requests: number; uniqueWidths: number; hits: number; verifiedWidths: number }
}>

export function selectBestWidth(measure: (width: number) => Promise<WidthMeasurement>, options?: { signal?: AbortSignal; verify?: (width: number, measurement: WidthMeasurement) => Promise<Partial<WidthMeasurement>> }): Promise<{ candidates: WidthMeasurement[]; best: WidthMeasurement; renderCache: { strategy: string; requests: number; uniqueWidths: number; hits: number; verifiedWidths: number } }>
