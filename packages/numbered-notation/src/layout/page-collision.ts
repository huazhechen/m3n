import { scoreLayoutConfig } from '../score-layout-config.js'
import { sortedScoreInkSeparation } from './ink-separation.js'
import type { ScoreInk } from './geometry.js'

export type ScoreCollisionInk = {
  ink: readonly ScoreInk[]
  boundaryInk?: readonly ScoreInk[]
  edgeInk?: readonly (ScoreInk & { gap: number })[]
}
export type ScoreCollision = { collision: number; edge: number }

/** Shared element collision rule. Fixed attachment clearances are independent
 * of the elastic core gap. Boundary-only labels reserve page edges. */
export function scorePageCollision(upper: ScoreCollisionInk, lower: ScoreCollisionInk): ScoreCollision {
  const separation = (a: readonly ScoreInk[], b: readonly ScoreInk[]) => {
    let distance = sortedScoreInkSeparation(a, b)
    // Preserve point-like rules without giving them an artificial painted width.
    for (const first of a) if (first.right <= first.left)
      for (const second of b) if (first.left < second.right && first.right > second.left)
        distance = Math.max(distance, first.bottom - second.top)
    for (const second of b) if (second.right <= second.left)
      for (const first of a) if (first.left < second.right && first.right > second.left)
        distance = Math.max(distance, first.bottom - second.top)
    return distance
  }
  let edge = -Infinity
  if (lower.edgeInk?.length) edge = separation(
    [...upper.ink, ...(upper.boundaryInk ?? [])].sort((a,b)=>a.left-b.left),
    lower.edgeInk.map(piece => ({ ...piece, top: piece.top - piece.gap })).sort((a,b)=>a.left-b.left))
  if (upper.edgeInk?.length) edge = Math.max(edge, separation(
    upper.edgeInk.map(piece => ({ ...piece, bottom: piece.bottom + piece.gap })).sort((a,b)=>a.left-b.left), lower.ink))
  return { collision: separation(upper.ink, lower.ink), edge }
}

/** One non-core clearance policy for both notation adapters and every solver. */
export function scorePageDistance(pair: ScoreCollision, localGap: number, coreDistance: number): number {
  return Math.max(coreDistance, pair.collision + localGap * scoreLayoutConfig.page.collisionGapRatio, pair.edge)
}
