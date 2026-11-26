import { prepareScorePagination, scoreEnvelopeBlock, scoreLayoutConfig, scoreLyricGapScale, type ScorePageBlock } from '@m3n/numbered-notation'
import type { StaffSystem, StaffPage } from './system-layout.js'

export const staffMusicCentre = scoreLayoutConfig.staff.music * 1.5
export function staffHeaderBlock(height: number): ScorePageBlock {
  return { height, ink: [{ left: 0, right: 1, top: 0, bottom: height }] }
}
export function staffRowBlock(system: StaffSystem, index: number, gap: number): ScorePageBlock {
  const block = scoreEnvelopeBlock(system.envelope!, 1, staffMusicCentre)
  return { ...block, coreGapScale: system.envelope!.hasLyrics ? scoreLyricGapScale(gap) : 1,
    ...(index === 0 ? { coreGapBefore: 0 } : {}),
    gapBefore: index > 0 && system.section ? scoreLayoutConfig.staff.sectionGap : 0 }
}
/** The same numeric whole-row paginator is used for planning and SVG output. */
export function paginateStaffRows(systems: StaffSystem[], height: number, headerHeight: number, minimum: number,
  paged: boolean, maximum: number): StaffPage[] {
  const blocks = [staffHeaderBlock(headerHeight), ...systems.map((system, index) => staffRowBlock(system, index, minimum))]
  const placed = prepareScorePagination(blocks, { wholeRows: true, nonCoreGapRatio: .3 })({
    pageHeight: paged ? height : Infinity, margin: scoreLayoutConfig.staff.pageInset,
    gap: minimum, maxGap: paged ? maximum : minimum, headerGap: 0,
  })
  return placed.heights.map((pageHeight, page) => {
    const indices = systems.flatMap((_, index) => placed.positions[index + 1]!.page === page ? [index] : [])
    return { systems: indices.map(index => systems[index]!), ys: indices.map(index => placed.positions[index + 1]!.top),
      height: pageHeight, gap: placed.coreGaps![page]! }
  })
}
