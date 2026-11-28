/** Painted bounds in baseline coordinates, independent of notation and SVG. */
export type ScoreInk = { left: number; right: number; top: number; bottom: number }

/** Adapter geometry consumed by both optimistic search and exact pagination.
 * Unknown rows supply safe bounds; resolved rows supply their actual ink.
 */
export type ScorePageBlock = {
  height: number
  /** Optimistic pagination only: actual tops are <= these top constraints;
   * actual bottoms are >= the bottom constraints. Each horizontal span must
   * be contained in the corresponding actual ink span. */
  lowerBoundGeometry?: { top: number; bottom: number; topInk: readonly ScoreInk[]; bottomInk: readonly ScoreInk[] }
  /** Adapter-resolved header geometry; musical rows remain immutable. */
  atRowGap?: (gap: number) => ScorePageBlock
  baseline?: number
  core?: { top: number; bottom: number }
  coreGapBefore?: number
  coreGapScale?: number
  gapBefore?: number
  resolvedInk?: boolean
  ink?: readonly ScoreInk[]
  boundaryInk?: readonly ScoreInk[]
  edgeInk?: readonly (ScoreInk & { gap: number })[]
}
export type ScoreBlockPosition = { page: number; top: number }
