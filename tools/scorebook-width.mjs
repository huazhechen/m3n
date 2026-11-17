/** Width is the only engraving variable; all candidates use the web defaults. */
export const widthCandidates = Array.from({ length: 23 }, (_, index) => 540 + index * 10)

export function chooseBestWidth(candidates) {
  const safe = candidates.filter(candidate => !candidate.error && candidate.stable !== false && candidate.pageCount > 0 && !candidate.outside.length && !candidate.overlaps.length)
  // Fixed A4 placement makes a narrower source produce larger music.
  return safe.sort((a, b) => a.pageCount - b.pageCount || a.width - b.width)[0] ?? null
}

/** Cache actual widths shared by adjacent ±5px probes; compare pages, not row breaks. */
export async function probeWidthCandidates(measure) {
  const cache = new Map(), candidates = []
  let requests = 0, hits = 0
  const probe = async width => {
    requests++
    if (cache.has(width)) { hits++; return cache.get(width) }
    const result = await measure(width)
    cache.set(width, result)
    return result
  }
  for (const width of widthCandidates) {
    const cases = []
    for (const offset of [-5, 0, 5]) cases.push(await probe(width + offset))
    const stable = cases.every(c => !c.error && c.pageCount > 0 && !c.outside.length && !c.overlaps.length && c.pageCount === cases[1].pageCount)
    candidates.push({ ...cases[1], stable, stabilityCases: cases })
  }
  return { candidates, renderCache: { requests, uniqueWidths: cache.size, hits } }
}
