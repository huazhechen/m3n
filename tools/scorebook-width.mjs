/** Width is the only engraving variable; all candidates use the web defaults. */
export const widthCandidates = Array.from({ length: 11 }, (_, index) => 540 + index * 10)
export const widthSearchStrategy = 'exhaustive-quality-540-640-v6'
const safe = c => !c.error && c.pageCount > 0 && !c.outside.length && !c.overlaps.length
export function numberedLayoutScore(candidate) {
  if (candidate.qualityScore !== undefined) return candidate.qualityScore
  const variation = candidate.lineDensityVariation ?? 0
  const slack = candidate.lastLineSlack ?? 0
  return (540 / candidate.width) / (1 + variation + .5 * slack)
}
const rank = (a, b) => a.pageCount - b.pageCount || numberedLayoutScore(b) - numberedLayoutScore(a) || a.width - b.width

export function chooseBestWidth(candidates) {
  // First minimize pages, then use the same density / slack quality score as
  // the online reader. Width is only a deterministic final tie breaker.
  return candidates.filter(c => safe(c)).sort(rank)[0] ?? null
}

/** Measure each actual candidate once; no neighboring-width probes. */
export async function probeWidthCandidates(measure, { verify } = {}) {
  const candidates = []
  let verifiedWidths = 0
  for (const width of widthCandidates) {
    let result
    try {
      result = { width, ...await measure(width) }
      if (verify && safe(result)) {
        verifiedWidths++
        result = { ...result, ...await verify(width, result) }
      }
    } catch (error) { result = { width, error: error.message } }
    candidates.push(result)
  }
  return { candidates, renderCache: { strategy: widthSearchStrategy, requests: widthCandidates.length,
    uniqueWidths: widthCandidates.length, hits: 0, verifiedWidths } }
}
