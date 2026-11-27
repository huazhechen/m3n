import type { ScorePageBlock } from './geometry.js'

/** All distances use the visual music centre, never a row's total height. */
export type ScoreHeightEnvelope = {
  coreAbove: number; coreBelow: number; extraAbove: number; extraBelow: number; hasLyrics: boolean
}

export function scoreHeightEnvelope(block: ScorePageBlock, centre = block.baseline ?? 0, hasLyrics = false): ScoreHeightEnvelope {
  const ink = [...(block.ink ?? []), ...(block.boundaryInk ?? [])]
  const top = Math.min(centre, ...ink.map(piece => piece.top))
  const bottom = Math.max(centre, ...ink.map(piece => piece.bottom))
  const coreAbove = Math.max(0, centre - (block.core?.top ?? top))
  const coreBelow = Math.max(0, (block.core?.bottom ?? bottom) - centre)
  return { coreAbove, coreBelow, extraAbove: Math.max(0, centre - top - coreAbove),
    extraBelow: Math.max(0, bottom - centre - coreBelow), hasLyrics }
}

export function mergeScoreHeightEnvelopes(items: readonly ScoreHeightEnvelope[]): ScoreHeightEnvelope {
  const coreAbove = Math.max(0, ...items.map(item => item.coreAbove))
  const coreBelow = Math.max(0, ...items.map(item => item.coreBelow))
  // Extras are measured from the merged core: do not add peaks belonging to
  // different measures and invent empty vertical space between those peaks.
  return { coreAbove, coreBelow,
    extraAbove: Math.max(0, ...items.map(item => item.coreAbove + item.extraAbove)) - coreAbove,
    extraBelow: Math.max(0, ...items.map(item => item.coreBelow + item.extraBelow)) - coreBelow,
    hasLyrics: items.some(item => item.hasLyrics) }
}

export function scoreEnvelopeBlock(envelope: ScoreHeightEnvelope, width: number, centre = 0): ScorePageBlock {
  return { baseline: centre, height: centre + envelope.coreBelow + envelope.extraBelow,
    core: { top: centre - envelope.coreAbove, bottom: centre + envelope.coreBelow },
    ink: [{ left: 0, right: width, top: centre - envelope.coreAbove - envelope.extraAbove,
      bottom: centre + envelope.coreBelow + envelope.extraBelow }] }
}
