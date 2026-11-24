import type { WidthMeasurement } from './scorebook-width.mjs'
export type PackingEntry = { title: string; section: string; preferredWidth?: number; sharePage?: boolean; breakBefore?: boolean; candidates: WidthMeasurement[] }
export type PackingGroup = { start: number; end: number; width: number; pageCount: number }
export const sharedScoreGap: number
export const sharedPreferredWidth: number
export const packingPolicy: Readonly<{ targetFill: number; sparseBelow: number; crowdedAbove: number; sparseWeight: number; crowdedWeight: number; balanceWeight: number; pageWeight: number }>
export function pageDensityPenalty(fill: number): number
export function optimizeScorebook<T extends PackingEntry>(entries: T[], movableSections?: Set<string>): {
  entries: T[]
  groups: PackingGroup[]
  metrics: { cost: number; pages: number; densityPenalty: number; pageGroups: { titles: string[]; width: number; pageCount: number; naturalFill: number | null }[] }
}
export function packScorebook(entries: PackingEntry[]): PackingGroup[]
export function reorderForSharing<T extends PackingEntry>(entries: T[], movableSections?: Set<string>): T[]
