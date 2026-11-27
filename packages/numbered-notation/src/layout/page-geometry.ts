import type { ScoreInk } from './geometry.js'
import type { ScorePageBlock } from './geometry.js'

export type ScorePageGeometry = {
  top: number; bottom: number; coreTop: number; coreBottom: number; music: boolean
  scale: number; gap?: number; before: number; resolved: boolean; sorted: boolean
  ink: ScoreInk[]; boundaryInk: ScoreInk[]; edgeInk: (ScoreInk & { gap: number })[]
}

/** Normalize once around the row baseline; identical page edges, cores and
 * primitive semantics are consumed by rendering and optimistic search. */
export function scorePageGeometry(block: ScorePageBlock): ScorePageGeometry {
  const axis = block.baseline ?? 0
  const shift = <T extends ScoreInk>(piece: T): T => ({ ...piece, top: piece.top - axis, bottom: piece.bottom - axis })
  const ink = (block.ink ?? []).map(shift), boundaryInk = (block.boundaryInk ?? []).map(shift), edgeInk = (block.edgeInk ?? []).map(shift)
  let top = 0, bottom = 0
  for (const pieces of [ink, boundaryInk, edgeInk]) for (const piece of pieces) {
    top = Math.min(top, piece.top); bottom = Math.max(bottom, piece.bottom)
  }
  return { ink, boundaryInk, edgeInk, top, bottom, coreTop: block.core ? block.core.top - axis : top,
    coreBottom: block.core ? block.core.bottom - axis : bottom, music: Boolean(block.core),
    scale: block.coreGapScale ?? 1, gap: block.coreGapBefore, before: block.gapBefore ?? 0,
    resolved: Boolean(block.resolvedInk), sorted: false }
}
