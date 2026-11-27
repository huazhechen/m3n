import { scoreLayoutConfig } from '../score-layout-config.js'
import { sortedScoreInkSeparation, cacheScoreInkSeparation, hasCachedScoreInkSeparation } from './ink-separation.js'
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
    for (const first of pointPieces(a))
      for (const second of b) if (first.left < second.right && first.right > second.left)
        distance = Math.max(distance, first.bottom - second.top)
    for (const second of pointPieces(b))
      for (const first of a) if (first.left < second.right && first.right > second.left)
        distance = Math.max(distance, first.bottom - second.top)
    return distance
  }
  let edge = -Infinity
  if (lower.edgeInk?.length) {
    const fixed = edgePieces(lower.edgeInk, true)
    // The maximum over a union is the maximum of each part. Reuse ordinary
    // ink's contour instead of copying and sorting a second complete row.
    edge = separation(upper.ink, fixed)
    if (upper.boundaryInk?.length) edge = Math.max(edge, separation(boundaryPieces(upper.boundaryInk), fixed))
  }
  if (upper.edgeInk?.length) edge = Math.max(edge, separation(edgePieces(upper.edgeInk, false), lower.ink))
  return { collision: separation(upper.ink, lower.ink), edge }
}

/** One non-core clearance policy for both notation adapters and every solver. */
export function scorePageDistance(pair: ScoreCollision, localGap: number, coreDistance: number): number {
  return Math.max(coreDistance, pair.collision + localGap * scoreLayoutConfig.page.collisionGapRatio, pair.edge)
}

const boundaryCache = new WeakMap<readonly ScoreInk[], ScoreInk[]>()
function boundaryPieces(ink: readonly ScoreInk[]): ScoreInk[] {
  const reusable = hasCachedScoreInkSeparation(ink)
  const saved = reusable ? boundaryCache.get(ink) : undefined
  if (saved) return saved
  const pieces = [...ink].sort((a,b)=>a.left-b.left)
  if (reusable) { boundaryCache.set(ink, pieces); cacheScoreInkSeparation(pieces) }
  return pieces
}
const edgeCache = new WeakMap<readonly (ScoreInk & { gap: number })[], { top?: ScoreInk[]; bottom?: ScoreInk[] }>()
function edgePieces(ink: readonly (ScoreInk & { gap: number })[], top: boolean): ScoreInk[] {
  const reusable = hasCachedScoreInkSeparation(ink), key = top ? 'top' : 'bottom'
  let variants = reusable ? edgeCache.get(ink) : undefined
  if (variants?.[key]) return variants[key]
  const pieces = ink.map(piece => top ? { ...piece, top: piece.top - piece.gap } : { ...piece, bottom: piece.bottom + piece.gap }).sort((a,b)=>a.left-b.left)
  if (reusable) {
    if (!variants) { variants = {}; edgeCache.set(ink, variants) }
    variants[key] = pieces; cacheScoreInkSeparation(pieces)
  }
  return pieces
}

const pointCache = new WeakMap<readonly ScoreInk[], readonly ScoreInk[]>()
function pointPieces(ink: readonly ScoreInk[]): readonly ScoreInk[] {
  const reusable = hasCachedScoreInkSeparation(ink)
  const saved = reusable ? pointCache.get(ink) : undefined
  if (saved) return saved
  const points = ink.filter(piece => piece.right <= piece.left)
  if (reusable) pointCache.set(ink, points)
  return points
}
