import { scoreHorizontalQuality, scoreNumberedFontCost } from '@m3n/numbered-notation/layout-quality'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout-config'

const config = scoreLayoutConfig.pageWidth

/** Width is the only engraving variable; all candidates use the web defaults. */
export const widthMinimum = config.unit * config.minimumMultiple, widthMaximum = config.unit * config.maximumMultiple, widthStep = config.unit
export const widthCandidates = Array.from({ length: (widthMaximum - widthMinimum) / widthStep + 1 }, (_, index) => widthMinimum + index * widthStep)
export const widthSearchStrategy = `levels-1-${widthCandidates.length}-quality-${widthMinimum}-${widthMaximum}-refine-6-v61`
const safe = c => !c.error && c.pageCount > 0 && !c.outside.length && !c.overlaps.length
export function numberedLayoutScore(candidate) {
  if (candidate.totalCost !== undefined) return 1 / (1 + candidate.totalCost)
  if (candidate.qualityScore !== undefined) return candidate.qualityScore
  const variation = candidate.lineDensityVariation ?? 0
  const slack = candidate.lastLineSlack ?? 0
  return scoreHorizontalQuality(candidate.width, { lineDensityVariation: variation, lastLineSlack: slack, lineStretchPenalty: candidate.lineStretchPenalty })
}
// Across widths, paper use is the primary objective in both notations.
const rank = (a, b) => a.pageCount - b.pageCount || numberedLayoutScore(b) - numberedLayoutScore(a) || a.width - b.width

export class WidthSearchPruned extends Error {}

// All horizontal costs are nonnegative. Once a one-page winner exists, font
// loss alone certifies that a width cannot win. Multi-page winners cannot.
export function widthQualityUpperBound(width, numbered) {
  const legacy = (widthMinimum / width) ** 2
  const additive = 1 / (1 + scoreNumberedFontCost(width))
  // Shared averaged scores lack a notation tag: use a bound safe for both.
  return numbered === true ? additive : numbered === false ? legacy : Math.max(legacy, additive)
}
export function widthCannotWin(width, best, minimumPageCount = 1) {
  return Boolean(best && best.pageCount === minimumPageCount && widthQualityUpperBound(width, best.totalCost !== undefined ? true : undefined) < numberedLayoutScore(best))
}

export function chooseBestWidth(candidates) {
  // First minimize paper use; then minimize physical spacing cost plus font loss
  // for numbered notation. Width is the deterministic final tie breaker.
  return candidates.filter(c => safe(c)).sort(rank)[0] ?? null
}

/** Search the complete 6px grid, skipping only certified losers. */
export async function probeWidthCandidates(measure, { verify, signal, prune = false } = {}) {
  const candidates = []
  const skippedWidths = []
  const estimatedSkippedWidths = []
  let endpointPages
  let requests = 0, tierRechecks = 0
  let best = null
  let verifiedWidths = 0
  // Short scores are sensitive to the loose tier's different break patterns.
  // Recheck the minimum with both tiers if its tight trial already fits one
  // page; multi-page scores keep the cheap tier. This remains an empirical, explicitly opted-in surrogate.
  const singleTier=globalThis.__m3nExperimentalSingleTier

  const probe = async width => {
    signal?.throwIfAborted()
    requests++
    let result
    try {
      result = { width, ...await measure(width, best) }
      if(singleTier && width===widthMinimum && safe(result) && result.pageCount===1) {
        globalThis.__m3nExperimentalSingleTier=false
        requests++;tierRechecks++
        result={width,...await measure(width,best)}
      }
      if (verify && safe(result)) {
        verifiedWidths++
        result = { ...result, ...await verify(width, result) }
      }
    } catch (error) {
      signal?.throwIfAborted()
      if (prune && !verify && error instanceof WidthSearchPruned) { skippedWidths.push(width); return }
      result = { width, error: error.message }
    }
    signal?.throwIfAborted()
    candidates.push(result)
    if(globalThis.__m3nExperimentalRowReuse && globalThis.__m3nExperimentalEndpointFloor && width===widthMaximum && safe(result))endpointPages=result.pageCount
    if(singleTier && width===widthMinimum)globalThis.__m3nExperimentalSingleTier=safe(result) && result.pageCount>1
    if (safe(result) && (!best || rank(result, best) < 0)) best = result
  }
  const consider = async width => {
    signal?.throwIfAborted()
    // Audits intentionally visit every original candidate, including losers.
    if (prune && !verify && widthCannotWin(width, best)) skippedWidths.push(width)
    else if(prune && !verify && endpointPages!==undefined && widthCannotWin(width,best,Math.min(endpointPages,best?.pageCount ?? 1))) {
      // Explicitly lossy: page counts need not be monotone in width.
      skippedWidths.push(width);estimatedSkippedWidths.push(width)
    } else await probe(width)
  }
  // Find a strong incumbent at 48px intervals before filling the original
  // 24px grid. Every omitted level still needs the same strict upper-bound
  // proof; line breaks are not monotone, so a local winning interval alone
  // cannot justify discarding other coarse levels.
  const coarseOrder = prune && !verify
    ? [...widthCandidates.filter((_, index) => index % 2 === 0), ...widthCandidates.filter((_, index) => index % 2 === 1)]
    : widthCandidates
  try {
  for (const width of coarseOrder) await consider(width)
  // A break can improve abruptly in any interval, including when every coarse
  // candidate failed. Always cover the entire grid for both notations.
  const measured = new Set([...candidates.map(candidate => candidate.width), ...skippedWidths])
  for (let width = widthMinimum; width <= widthMaximum; width += widthStep / 4)
    if (!measured.has(width)) await consider(width)
  return { candidates, renderCache: { strategy: widthSearchStrategy, requests,
    uniqueWidths: requests-tierRechecks, tierRechecks, hits: 0, verifiedWidths, skippedWidths, estimatedSkippedWidths } }
  } finally { if(singleTier)globalThis.__m3nExperimentalSingleTier=singleTier }
}

/** Run the common discrete width search and reject a score with no safe candidate. */
export async function selectBestWidth(measure, options) {
  const result = await probeWidthCandidates(measure, options)
  const best = chooseBestWidth(result.candidates)
  if (!best) {
    const errors = [...new Set(result.candidates.map(candidate => candidate.error).filter(Boolean))]
    throw new Error(`没有可用的排版候选。${errors.length ? ` ${errors.join('；')}` : ''}`)
  }
  return { ...result, best }
}

/** Exact-check estimates in rank order, continuing after page underestimates.
 * This verifies the returned geometry, not the global width/page error bound. */
export async function verifyEstimatedWidthCandidates(candidates, measure, { signal, verifyWidestWhenMultipage = false } = {}) {
  const ordered = candidates.filter(safe).sort(rank)
  const expectedPages = ordered[0]?.pageCount
  // A surrogate can overestimate pages as well as underestimate them. Probe
  // the widest endpoint before trusting a multi-page estimate. This catches
  // missed endpoint transitions; it is not a proof about intermediate widths.
  const widest = verifyWidestWhenMultipage && expectedPages > 1
    ? candidates.reduce((a,b) => !a || b.width > a.width ? b : a, null) : undefined
  const preflight = widest && widest.width !== ordered[0]?.width ? widest : undefined
  const queue = preflight ? [preflight,...ordered.filter(candidate => candidate.width!==preflight.width)] : ordered
  const verifiedCandidates = [], failures = []
  let best = null, requests = 0
  const started = performance.now()
  for (const candidate of queue) {
    signal?.throwIfAborted()
    requests++
    let exact
    try { exact = { width: candidate.width, ...await measure(candidate.width) } }
    catch (error) {
      signal?.throwIfAborted()
      failures.push({ width: candidate.width, error: String(error?.message ?? error) })
      continue
    }
    signal?.throwIfAborted()
    verifiedCandidates.push(exact)
    if (safe(exact) && (!best || rank(exact, best) < 0)) best = exact
    if (candidate!==preflight && safe(exact) && exact.pageCount <= expectedPages) break
  }
  if (!best) throw new Error('没有通过精确复核的选宽候选。')
  return { best, requests, ms: performance.now() - started, verifiedCandidates, failures }
}
