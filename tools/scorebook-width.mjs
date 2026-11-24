/** Width is the only engraving variable; all candidates use the web defaults. */
export const widthMinimum = 480, widthMaximum = 720, widthStep = 20
export const widthCandidates = Array.from({ length: (widthMaximum - widthMinimum) / widthStep + 1 }, (_, index) => widthMinimum + index * widthStep)
export const widthSearchStrategy = 'coarse20-refine10-quality-480-720-v9'
const safe = c => !c.error && c.pageCount > 0 && !c.outside.length && !c.overlaps.length
export function numberedLayoutScore(candidate) {
  if (candidate.qualityScore !== undefined) return candidate.qualityScore
  const variation = candidate.lineDensityVariation ?? 0
  const slack = candidate.lastLineSlack ?? 0
  return (widthMinimum / candidate.width) / (1 + variation + .5 * slack)
}
const rank = (a, b) => a.pageCount - b.pageCount || numberedLayoutScore(b) - numberedLayoutScore(a) || a.width - b.width

export function chooseBestWidth(candidates) {
  // First minimize pages, then use the same density / slack quality score as
  // the online reader. Width is only a deterministic final tie breaker.
  return candidates.filter(c => safe(c)).sort(rank)[0] ?? null
}

/** Search the 20px grid, then compare its winner with the two adjacent 10px slots. */
export async function probeWidthCandidates(measure, { verify, signal } = {}) {
  const candidates = []
  let verifiedWidths = 0
  const probe = async width => {
    signal?.throwIfAborted()
    let result
    try {
      result = { width, ...await measure(width) }
      if (verify && safe(result)) {
        verifiedWidths++
        result = { ...result, ...await verify(width, result) }
      }
    } catch (error) { result = { width, error: error.message } }
    signal?.throwIfAborted()
    candidates.push(result)
  }
  for (const width of widthCandidates) await probe(width)
  const coarseBest = chooseBestWidth(candidates)
  if (coarseBest) {
    for (const width of [coarseBest.width - widthStep / 2, coarseBest.width + widthStep / 2]) {
      if (width >= widthMinimum && width <= widthMaximum) await probe(width)
    }
  }
  return { candidates, renderCache: { strategy: widthSearchStrategy, requests: candidates.length,
    uniqueWidths: candidates.length, hits: 0, verifiedWidths } }
}

/** Run the common coarse-to-fine search and reject a score with no safe candidate. */
export async function selectBestWidth(measure, options) {
  const result = await probeWidthCandidates(measure, options)
  const best = chooseBestWidth(result.candidates)
  if (!best) throw new Error('没有可用的排版候选。')
  return { ...result, best }
}
