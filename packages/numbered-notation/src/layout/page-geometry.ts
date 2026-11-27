import { cacheScoreInkSeparation } from './ink-separation.js'
import type { ScoreInk } from './geometry.js'
import type { ScorePageBlock } from './geometry.js'

export type ScorePageGeometry = {
  top: number; bottom: number; coreTop: number; coreBottom: number; music: boolean
  scale: number; gap?: number; edgeGap: number; before: number; resolved: boolean; sorted: boolean
  ink: ScoreInk[]; boundaryInk: ScoreInk[]; edgeInk: (ScoreInk & { gap: number })[]
}

const immutableGeometry = new WeakMap<ScorePageBlock, ScorePageGeometry>()

/** Normalize once around the row baseline; identical page edges, cores and
 * primitive semantics are consumed by rendering and optimistic search. */
export function scorePageGeometry(block: ScorePageBlock, immutable = false): ScorePageGeometry {
  const saved = immutable ? immutableGeometry.get(block) : undefined
  if (saved) return saved
  const axis = block.baseline ?? 0
  const shift = <T extends ScoreInk>(piece: T): T => ({ ...piece, top: piece.top - axis, bottom: piece.bottom - axis })
  const ink = (block.ink ?? []).map(shift), boundaryInk = (block.boundaryInk ?? []).map(shift), edgeInk = (block.edgeInk ?? []).map(shift)
  for (const pieces of [ink, boundaryInk, edgeInk]) cacheScoreInkSeparation(pieces)
  let top = 0, bottom = 0
  for (const pieces of [ink, boundaryInk, edgeInk]) for (const piece of pieces) {
    top = Math.min(top, piece.top); bottom = Math.max(bottom, piece.bottom)
  }
  const value = { ink, boundaryInk, edgeInk, top, bottom, coreTop: block.core ? block.core.top - axis : top,
    coreBottom: block.core ? block.core.bottom - axis : bottom, music: Boolean(block.core),
    scale: block.coreGapScale ?? 1, gap: block.coreGapBefore, edgeGap: Math.max(0, ...edgeInk.map(piece => piece.gap)), before: block.gapBefore ?? 0,
    resolved: Boolean(block.resolvedInk), sorted: false }
  if (immutable) immutableGeometry.set(block, value)
  return value
}
