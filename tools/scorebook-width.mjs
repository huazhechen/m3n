import { scoreHorizontalQuality, scoreNumberedFontCost } from '@m3n/numbered-notation/layout-quality'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout-config'

const config = scoreLayoutConfig.pageWidth

/** Width is the only engraving variable; all candidates use the web defaults. */
export const widthMinimum = config.unit * config.minimumMultiple, widthMaximum = config.unit * config.maximumMultiple, widthStep = config.unit
export const widthCandidates = Array.from({ length: (widthMaximum - widthMinimum) / widthStep + 1 }, (_, index) => widthMinimum + index * widthStep)
export const widthSearchStrategy = `levels-1-${widthCandidates.length}-quality-${widthMinimum}-${widthMaximum}-refine-6-v41`
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
export function widthCannotWin(width, best) {
  return Boolean(best && best.pageCount === 1 && widthQualityUpperBound(width, best.totalCost !== undefined ? true : undefined) < numberedLayoutScore(best))
}

export function chooseBestWidth(candidates) {
  // First minimize paper use; then minimize physical spacing cost plus font loss
  // for numbered notation. Width is the deterministic final tie breaker.
  return candidates.filter(c => safe(c)).sort(rank)[0] ?? null
}

/** Search the full additive-cost grid, or the explicitly requested local mode. */
export async function probeWidthCandidates(measure, { verify, signal, prune = false, localRefine = false } = {}) {
  const candidates = []
  const skippedWidths = []
  let requests = 0
  let best = null
  let verifiedWidths = 0
  const probe = async width => {
    signal?.throwIfAborted()
    requests++
    let result
    try {
      result = { width, ...await measure(width, best) }
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
    if (safe(result) && (!best || rank(result, best) < 0)) best = result
  }
  const consider = async width => {
    signal?.throwIfAborted()
    // Audits intentionally visit every original candidate, including losers.
    if (prune && !verify && widthCannotWin(width, best)) skippedWidths.push(width)
    else await probe(width)
  }
  // Find a strong incumbent at 48px intervals before filling the original
  // 24px grid. Every omitted level still needs the same strict upper-bound
  // proof; line breaks are not monotone, so a local winning interval alone
  // cannot justify discarding other coarse levels.
  const coarseOrder = prune && !verify
    ? [...widthCandidates.filter((_, index) => index % 2 === 0), ...widthCandidates.filter((_, index) => index % 2 === 1)]
    : widthCandidates
  for (const width of coarseOrder) await consider(width)
  const coarseBest = chooseBestWidth(candidates)
  if (coarseBest?.totalCost !== undefined && !localRefine) {
    // A break can improve abruptly in any coarse interval. Numbered notation
    // visits the entire 6px grid, pruning only by the certified font-cost bound.
    const measured = new Set([...candidates.map(candidate => candidate.width), ...skippedWidths])
    for (let width = widthMinimum; width <= widthMaximum; width += widthStep / 4)
      if (!measured.has(width)) await consider(width)
  } else if (coarseBest) {
    const lower = Math.max(widthMinimum, coarseBest.width - widthStep)
    const upper = Math.min(widthMaximum, coarseBest.width + widthStep)
    const measured = new Set([...candidates.map(candidate => candidate.width), ...skippedWidths])
    for (let width = lower; width <= upper; width += widthStep / 4) if (!measured.has(width)) await consider(width)
  }
  return { candidates, renderCache: { strategy: widthSearchStrategy + (localRefine ? '-local' : ''), requests,
    uniqueWidths: requests, hits: 0, verifiedWidths, skippedWidths } }
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
