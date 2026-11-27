import { prepareScorePagination, scoreLayoutConfig, scoreLyricGapScale, type ScorePageBlock } from '@m3n/numbered-notation'
import type { StaffSystem, StaffPage } from './system-layout.js'

export const staffMusicCentre = scoreLayoutConfig.staff.music * 1.5
export function staffHeaderBlock(height: number): ScorePageBlock {
  return { height, ink: [{ left: -Infinity, right: Infinity, top: 0, bottom: height }] }
}
const rowBlocks = new WeakMap<StaffSystem, Map<string, ScorePageBlock>>()
export function staffRowBlock(system: StaffSystem, index: number, gap: number): ScorePageBlock {
  const key = `${index === 0}:${gap}`
  let variants = rowBlocks.get(system)
  const saved = variants?.get(key)
  if (saved && saved.ink === system.spacingPieces && saved.core === system.core && saved.boundaryInk === system.pieces) return saved
  system.materializeInk?.()
  const block: ScorePageBlock = { resolvedInk: true, height: system.ink.bottom - system.ink.top, core: system.core,
    ink: system.spacingPieces, boundaryInk: system.pieces, edgeInk: system.edgePieces,
    coreGapScale: system.hasLyrics ? scoreLyricGapScale(gap) : 1,
    ...(index === 0 ? { coreGapBefore: 0 } : {}),
    gapBefore: index > 0 && system.section ? scoreLayoutConfig.staff.sectionGap : 0 }
  if (!variants) { variants = new Map(); rowBlocks.set(system, variants) }
  variants.set(key, block)
  return block
}
/** The same shared element paginator is used for planning and SVG output. */
export function paginateStaffRows(systems: StaffSystem[], height: number, headerHeight: number, minimum: number,
  paged: boolean, maximum: number): StaffPage[] {
  const blocks = [staffHeaderBlock(headerHeight), ...systems.map((system, index) => staffRowBlock(system, index, minimum))]
  const placed = prepareScorePagination(blocks, { immutableBlocks: true })({
    pageHeight: paged ? height : Infinity, margin: scoreLayoutConfig.staff.pageInset,
    gap: minimum, maxGap: paged ? maximum : minimum, headerGap: 0,
  })
  return placed.heights.map((pageHeight, page) => {
    const indices = systems.flatMap((_, index) => placed.positions[index + 1]!.page === page ? [index] : [])
    return { systems: indices.map(index => systems[index]!), ys: indices.map(index => placed.positions[index + 1]!.top),
      height: pageHeight, gap: placed.coreGaps![page]! }
  })
}
