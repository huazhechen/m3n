import { optimizedScoreWidthPolicy, exactScoreWidthPolicy } from '@m3n/numbered-notation/layout'
export { optimizedScoreWidthPolicy, exactScoreWidthPolicy }
import { scoreHorizontalQuality, scoreNumberedFontCost, scorePageCost } from '@m3n/numbered-notation/layout-quality'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout-config'

const config = scoreLayoutConfig.pageWidth

/** Width is the only engraving variable; all candidates use the web defaults. */
export const widthMinimum = config.unit * config.minimumMultiple, widthMaximum = config.unit * config.maximumMultiple, widthStep = config.unit
export const widthCandidates = Array.from({ length: (widthMaximum - widthMinimum) / widthStep + 1 }, (_, index) => widthMinimum + index * widthStep)
export const widthSearchStrategy = `levels-1-${widthCandidates.length}-quality-${widthMinimum}-${widthMaximum}-refine-6-v90-exact`
const safe = c => !c.error && c.pageCount > 0 && !c.outside.length && !c.overlaps.length
function spacingLayoutScore(candidate) {
  if (candidate.totalCost !== undefined) return 1 / (1 + candidate.totalCost)
  if (candidate.qualityScore !== undefined) return candidate.qualityScore
  const variation = candidate.lineDensityVariation ?? 0
  const slack = candidate.lastLineSlack ?? 0
  return scoreHorizontalQuality(candidate.width, { lineDensityVariation: variation, lastLineSlack: slack, lineStretchPenalty: candidate.lineStretchPenalty })
}
export function numberedLayoutScore(candidate) {
  const spacingCost = candidate.totalCost ?? 1 / spacingLayoutScore(candidate) - 1
  return 1 / (1 + spacingCost + scorePageCost(candidate.pageCount ?? 1))
}
// Both notations combine paper, spacing and font costs.
export const compareWidthMeasurements = (a, b) => numberedLayoutScore(b) - numberedLayoutScore(a) || a.width - b.width

export class WidthSearchPruned extends Error {}

// Nonnegative spacing and paper costs give a safe font-plus-page lower bound.
export function widthQualityUpperBound(width, numbered) {
  const legacy = (widthMinimum / width) ** 2
  const additive = 1 / (1 + scoreNumberedFontCost(width))
  // Shared averaged scores lack a notation tag: use a bound safe for both.
  return numbered === true ? additive : numbered === false ? legacy : Math.max(legacy, additive)
}
export function widthCannotWin(width, best, minimumPageCount = 1) {
  return Boolean(best && 1 / (1 / widthQualityUpperBound(width, best.totalCost !== undefined ? true : undefined) + scorePageCost(minimumPageCount)) < numberedLayoutScore(best))
}

export function chooseBestWidth(candidates) {
  // Minimize the combined cost; width is the deterministic final tie breaker.
  return candidates.filter(c => safe(c)).sort(compareWidthMeasurements)[0] ?? null
}

/** Cover every 6px interval; explicit estimate policies also record lossy prunes. */
export async function probeWidthCandidates(measure, { verify, signal, prune = false, candidatePolicy, prepareCandidate } = {}) {
  if (prepareCandidate && prune && !verify && candidatePolicy === exactScoreWidthPolicy)
    return probePreparedWidths(prepareCandidate, { signal, candidatePolicy })
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
  const singleTier=candidatePolicy ? candidatePolicy.singleTier : globalThis.__m3nExperimentalSingleTier
  let measurementPolicy=candidatePolicy
  const setSingleTier=value=>{
    if(candidatePolicy) {
      if(value!==measurementPolicy.singleTier)measurementPolicy={...candidatePolicy,singleTier:value}
    } else globalThis.__m3nExperimentalSingleTier=value
  }
  // Old incumbent page ceilings would incorrectly exclude affordable extra pages.
  const measureCandidate=(width,incumbent)=>measure(width,null,
    prune && !verify && incumbent && candidatePolicy === exactScoreWidthPolicy
      ? {...measurementPolicy,widthBound:{width:incumbent.width,quality:numberedLayoutScore(incumbent)}}
      : measurementPolicy)
  const endpointFloor=candidatePolicy ? candidatePolicy.rowReuse && candidatePolicy.endpointFloor
    : globalThis.__m3nExperimentalRowReuse && globalThis.__m3nExperimentalEndpointFloor
  const probe = async width => {
    signal?.throwIfAborted()
    requests++
    let result
    try {
      result = { width, ...await measureCandidate(width, best) }
      if(singleTier && width===widthMinimum && safe(result) && result.pageCount===1) {
        setSingleTier(false)
        requests++;tierRechecks++
        result={width,...await measureCandidate(width,best)}
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
    if(endpointFloor && width===widthMaximum && safe(result))endpointPages=result.pageCount
    if(singleTier && width===widthMinimum)setSingleTier(safe(result) && result.pageCount>1)
    if (safe(result) && (!best || compareWidthMeasurements(result, best) < 0)) best = result
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
  // 24px grid. Exact mode needs a strict upper-bound proof for omissions;
  // estimate policies record their extra prunes separately. A local interval
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
  } finally { if(!candidatePolicy && singleTier)globalThis.__m3nExperimentalSingleTier=singleTier }
}

/** Both adapters expose exact horizontal plans and safe combined lower costs.
 * Heuristics choose order only; every omitted width needs its own proof. */
async function probePreparedWidths(prepare, { signal, candidatePolicy }) {
  const pending = [], candidates = [], skippedWidths = []
  let best = null, requests = 0
  const bound = () => best ? { width: best.width, quality: numberedLayoutScore(best) } : undefined
  const cannotWin = item => {
    if (!best || !Number.isFinite(item.lower)) return false
    const scale = Math.max(1, Math.abs(item.lower), 1 / numberedLayoutScore(best))
    const optimistic = 1 / (1 + item.lower - 64 * Number.EPSILON * scale)
    return optimistic < numberedLayoutScore(best)
      || optimistic === numberedLayoutScore(best) && item.width >= best.width
  }
  const complete = async item => {
      signal?.throwIfAborted()
      if (cannotWin(item) || widthCannotWin(item.width, best)) { skippedWidths.push(item.width); return }
      requests++
      try {
        const incumbent = bound()
        const result = { width: item.width, ...await item.plan.complete(incumbent ? { ...candidatePolicy, widthBound: incumbent } : candidatePolicy) }
        signal?.throwIfAborted()
        candidates.push(result)
        if (safe(result) && (!best || compareWidthMeasurements(result, best) < 0)) best = result
      } catch (error) {
        signal?.throwIfAborted()
        if (error instanceof WidthSearchPruned) skippedWidths.push(item.width)
        else candidates.push({ width: item.width, error: error.message })
      }
    }
  try {
    for (let width = widthMinimum; width <= widthMaximum; width += widthStep / 4) {
      signal?.throwIfAborted()
      if (widthCannotWin(width, best)) { skippedWidths.push(width); continue }
      let plan, item
      try {
        plan = await prepare(width, candidatePolicy)
        const refined = plan.horizontalLowerBound === undefined
        const lower = refined ? plan.lowerBound() : plan.horizontalLowerBound
        item = { width, plan, lower, refined, completed: false }
        pending.push(item)
      } catch (error) {
        plan?.dispose?.()
        signal?.throwIfAborted()
        candidates.push({ width, error: error.message })
        continue
      }
      // Short plans establish an incumbent immediately; longer scores use
      // the best-first queue. Priority never justifies an omission.
      if (width === widthMinimum && plan.rowCount <= 12) {
        await complete(item)
        item.completed = true
      }
    }
    // Lower bounds provide a cheap priority, but need not predict the winner.
    const queue = pending.filter(item => !item.completed)
    while (queue.length) {
      signal?.throwIfAborted()
      queue.sort((a, b) => a.lower - b.lower || a.width - b.width)
      const item = queue.shift()
      if (!cannotWin(item) && !widthCannotWin(item.width, best) && !item.refined) {
        try { item.lower = item.plan.lowerBound() }
        catch (error) {
          signal?.throwIfAborted()
          // A failed bound is not proof that the exact layout is invalid.
          await complete(item)
          continue
        }
        item.refined = true
        queue.push(item)
        continue
      }
      await complete(item)
    }
    return { candidates, renderCache: { strategy: widthSearchStrategy, requests,
      uniqueWidths: requests, tierRechecks: 0, hits: 0, verifiedWidths: 0, skippedWidths,
      estimatedSkippedWidths: [], preparedWidths: pending.length, refinedWidths: pending.filter(item => item.refined).length, preparationPilotRows: 12 } }
  } finally { for (const item of pending) item.plan.dispose?.() }
}

/** Run the common discrete width search and reject a score with no safe candidate. */
export async function selectBestWidth(measure, options) {
  const result = await probeWidthCandidates(measure, options)
  const best = chooseBestWidth(result.candidates)
  if (!best) {
    const errors = [...new Set(result.candidates.map(candidate => candidate.error).filter(Boolean))]
    throw new Error(`没有可用的排版候选。${errors.length ? ` ${errors.join('；')}` : ''}`)
  }
  if(!options?.candidatePolicy || options.candidatePolicy === exactScoreWidthPolicy)return { ...result, best }
  const verified=await verifyEstimatedWidthCandidates(result.candidates,width=>measure(width,null,exactScoreWidthPolicy),{
    signal:options.signal,verifyWidestWhenMultipage:true,
  })
  return {...result,best:verified.best,verifiedCandidates:verified.verifiedCandidates,verificationFailures:verified.failures,
    renderCache:{...result.renderCache,strategy:result.renderCache.strategy+'-estimated-v1',
      finalExactMs:verified.ms,finalExactRequests:verified.requests}}
}

/** Exact-check estimates in rank order, continuing after page underestimates.
 * This verifies the returned geometry, not the global width/page error bound. */
export async function verifyEstimatedWidthCandidates(candidates, measure, { signal, verifyWidestWhenMultipage = false } = {}) {
  const ordered = candidates.filter(safe).sort(compareWidthMeasurements)
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
    if (safe(exact) && (!best || compareWidthMeasurements(exact, best) < 0)) best = exact
    if (candidate!==preflight && safe(exact) && exact.pageCount <= candidate.pageCount) break
  }
  if (!best) throw new Error('没有通过精确复核的选宽候选。')
  return { best, requests, ms: performance.now() - started, verifiedCandidates, failures }
}
