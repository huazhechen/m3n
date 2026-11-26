import type { NativePageBlock } from './native-pagination.js'
import type { NativeLineCandidate } from './native-line-breaking.js'

type Box = { top: number; bottom: number; coreTop: number; coreBottom: number; music: boolean; scale: number; gap?: number; before: number }
type State = { box: Box; page: number; baseline: number }
const box = (block: NativePageBlock): Box => {
  const axis = block.baseline ?? 0
  const ink = [...(block.ink ?? []), ...(block.boundaryInk ?? [])]
  const top = Math.min(0, ...ink.map(item => item.top - axis))
  const bottom = Math.max(0, ...ink.map(item => item.bottom - axis))
  return { top, bottom, coreTop: block.core ? block.core.top - axis : top,
    coreBottom: block.core ? block.core.bottom - axis : bottom, music: Boolean(block.core),
    scale: block.coreGapScale ?? 1, gap: block.coreGapBefore, before: block.gapBefore ?? 0 }
}

/** Exact feasibility for whole-row, minimum-gap pagination. For each last row,
 * retain the smallest page index, then the lowest baseline. That state can
 * accommodate every suffix accommodated by another state for the same row.
 * Tail redistribution and gap fitting never change the number of pages. */
export function nativeWholeRowFeasibility(candidates: readonly (readonly NativeLineCandidate[])[],
  blockFor: (start: number, end: number) => NativePageBlock, headers: readonly NativePageBlock[],
  options: { pageHeight: number; margin: number; gap: number; headerGap: number; ratio: number }) {
  const { pageHeight, margin, gap, headerGap, ratio } = options
  const boxes = candidates.map((rows, start) => new Map(rows.map(row => [row.end, box(blockFor(start, row.end))])))
  const advance = (item: Box, previous?: State): State | undefined => {
    if (item.bottom - item.top > pageHeight - 2 * margin + 1e-6) return
    let baseline = margin - item.top, page = previous?.page ?? 0
    if (previous) {
      const localGap = item.gap ?? gap * previous.box.scale
      const separation = previous.box.music && item.music ? localGap : headerGap
      baseline = Math.max(baseline, previous.baseline + previous.box.coreBottom - item.coreTop + separation,
        previous.baseline + previous.box.bottom - item.top + ratio * localGap) + item.before
      if (baseline + item.bottom > pageHeight - margin + 1e-6) {
        page++; baseline = margin - item.top
      }
    }
    return { box: item, page, baseline }
  }
  let header: State | undefined
  for (const block of headers) {
    header = advance(box(block), header)
    if (!header) return () => false
  }
  return (restricted: readonly (readonly NativeLineCandidate[])[], ceiling: number): boolean => {
    const states = Array.from({ length: restricted.length + 1 }, () => new Map<number, State>())
    // A last row's start and this endpoint identify its complete envelope.
    for (let start = 0; start < restricted.length; start++) {
      const previous = start === 0 ? [header] : [...states[start]!.values()]
      for (const row of restricted[start]!) {
        const item = boxes[start]!.get(row.end)!
        let best: State | undefined
        for (const prior of previous) {
          const next = advance(item, prior)
          if (!next || next.page >= ceiling) continue
          if (!best || next.page < best.page || next.page === best.page && next.baseline < best.baseline) best = next
        }
        if (best) states[row.end]!.set(start, best)
      }
      states[start]!.clear()
    }
    return states[restricted.length]!.size > 0
  }
}
