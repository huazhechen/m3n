import { prepareScorePagination, type ScorePageBlock, scoreLayoutConfig, scoreHeaderGap, scoreLyricGapScale, type ScoreVerticalSpacing } from '@m3n/numbered-notation/layout'
import type { StaffSystem, StaffPage } from './system-layout.js'

export const staffMusicCentre = scoreLayoutConfig.staff.music * 1.5
export type StaffHeaderSize = number | { height: number; atRowGap: (gap: number) => { height: number } }
export function staffHeaderBlock(header: StaffHeaderSize): ScorePageBlock {
  const height = typeof header === 'number' ? header : header.height
  return { height, ink: [{ left: -Infinity, right: Infinity, top: 0, bottom: height }],
    ...(typeof header === 'number' ? {} : { atRowGap: (gap: number) => staffHeaderBlock(header.atRowGap(gap).height) }) }
}
const rowBlocks = new WeakMap<StaffSystem, Map<string, ScorePageBlock>>()
export function staffRowBlock(system: StaffSystem, index: number, gap: number): ScorePageBlock {
  const key = `${index === 0}:${gap}`
  let variants = rowBlocks.get(system)
  const saved = variants?.get(key)
  if (saved && saved.ink === system.spacingPieces && saved.core === system.core && saved.boundaryInk === (system.boundaryPieces ?? system.pieces)) return saved
  system.materializeInk?.()
  const block: ScorePageBlock = { resolvedInk: true, height: system.ink.bottom - system.ink.top, core: system.core,
    ink: system.spacingPieces, boundaryInk: system.boundaryPieces ?? system.pieces, edgeInk: system.edgePieces,
    coreGapScale: system.hasLyrics ? scoreLyricGapScale(gap) : 1,
    coreGapBefore: index === 0 ? undefined : system.coreGapBefore }
  if (!variants) { variants = new Map(); rowBlocks.set(system, variants) }
  variants.set(key, block)
  return block
}
/** Planning and output share every notation-specific pagination parameter. */
export function paginateStaffBlocks(blocks: readonly (ScorePageBlock | (() => ScorePageBlock))[], height: number, minimum: number,
  paged: boolean, maximum: number, headerGap = scoreHeaderGap(minimum), vertical?: ScoreVerticalSpacing, pageCeiling?: number): ReturnType<ReturnType<typeof prepareScorePagination>> {
  return prepareScorePagination(blocks, { immutableBlocks: true })({
    pageHeight: paged ? height : Infinity, margin: scoreLayoutConfig.staff.pageInset,
    gap: minimum, vertical, pageCeiling, maxGap: paged ? maximum : minimum, headerGap, headerGapRatio: 2 / 3,
  })
}
/** The same shared element paginator is used for planning and SVG output. */
export function paginateStaffRows(systems: StaffSystem[], height: number, headerHeight: StaffHeaderSize, minimum: number,
  paged: boolean, maximum: number, headerGap = scoreHeaderGap(minimum), vertical?: ScoreVerticalSpacing, pageCeiling?: number): StaffPage[] {
  const blocks = [staffHeaderBlock(headerHeight), ...systems.map((system, index) => staffRowBlock(system, index, minimum))]
  const placed = paginateStaffBlocks(blocks, height, minimum, paged, maximum, headerGap, vertical, pageCeiling)
  return staffPagesFromPlacement(systems, placed)
}
/** Preserve an already fitted exact plan without running the paginator again. */
export function staffPagesFromPlacement(systems: StaffSystem[], placed: ReturnType<typeof paginateStaffBlocks>): StaffPage[] {
  return placed.heights.map((pageHeight, page) => {
    const indices = systems.flatMap((_, index) => placed.positions[index + 1]!.page === page ? [index] : [])
    return { systems: indices.map(index => systems[index]!), ys: indices.map(index => placed.positions[index + 1]!.top),
      height: pageHeight, gap: placed.coreGaps![page]!, verticalCost: placed.verticalCost ?? 0 }
  })
}
