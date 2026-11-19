export type WidthMeasurement = {
  width: number
  error?: string
  pageCount: number
  rows: number
  outside: unknown[]
  overlaps: unknown[]
  naturalHeight?: number
  stable?: boolean
  stabilityCases?: WidthMeasurement[]
}
export const widthCandidates: number[]
export function chooseBestWidth(candidates: WidthMeasurement[]): WidthMeasurement | null
export function probeWidthCandidates(measure: (width: number) => Promise<WidthMeasurement>): Promise<{
  candidates: WidthMeasurement[]
  renderCache: { requests: number; uniqueWidths: number; hits: number }
}>
