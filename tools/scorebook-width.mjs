/** Width is the only engraving variable; all candidates use the web defaults. */
export const widthCandidates = Array.from({ length: 17 }, (_, index) => 640 + index * 10)

export function chooseBestWidth(candidates) {
  const safe = candidates.filter(candidate => !candidate.error && candidate.pageCount > 0 && !candidate.outside.length && !candidate.overlaps.length)
  // Fixed A4 placement makes a narrower source produce larger music.
  return safe.sort((a, b) => a.pageCount - b.pageCount || a.width - b.width)[0] ?? null
}
