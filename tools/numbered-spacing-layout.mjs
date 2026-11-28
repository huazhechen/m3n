import { analyzeM3N } from '@m3n/notation'
import { prepareNumberedNotationFonts, registerScoreFontBundle, NumberedLayoutTask, NumberedTextMeasurementCache } from '@m3n/numbered-notation'
import { selectBestWidth, optimizedScoreWidthPolicy, numberedLayoutScore, verifyEstimatedWidthCandidates } from './scorebook-width.mjs'
import { measureNumberedWidth } from './lib/numbered-width-measurement.mjs'

const textMeasurementCache = new NumberedTextMeasurementCache()

/** One batch uses the same installed library fonts and measured glyphs. */
export async function initialize(fonts) {
  registerScoreFontBundle(await Promise.all(fonts.map(async font => ({ ...font,
    data: new Uint8Array(await (await fetch(font.url)).arrayBuffer()),
  }))))
  await prepareNumberedNotationFonts(fonts.find(font => font.file === 'NotoSansSC-library.ttf').characters)
  textMeasurementCache.synchronizeFonts()
}

export async function search(source, auditLayout = false, prune = false, pageConstrainedBreaks = false, numericLayout = false) {
  const started = performance.now()
  const analysis = analyzeM3N(source)
  if (analysis.diagnostics.some(item => item.severity === 'error')) throw new Error('Invalid score source')
  const score = analysis.score
  await prepareNumberedNotationFonts(score)
  const settings = { numericLayout, pageConstrainedBreaks, layoutTask: new NumberedLayoutTask(), textMeasurementCache }
  const searchStarted = performance.now()
  const detailedTimings = auditLayout || Boolean(globalThis.__m3nDetailedLayoutTimings)
  const timings = {}
  const accumulate = partial => {
    for (const [key, value] of Object.entries(partial ?? {}))
      if (typeof value === 'number') timings[key] = key.includes('Maximum') ? Math.max(timings[key] ?? 0, value) : (timings[key] ?? 0) + value
  }
  const result = await selectBestWidth((width, best, candidatePolicy) => {
    if (globalThis.__m3nTraceWidths) console.log('width-start ' + width)
    try {
      const measured = measureNumberedWidth(score, width, { settings, detailedTimings, candidatePolicy,
        maximumPageCount: prune && !auditLayout ? best?.pageCount : undefined,
        minimumQuality: prune && !auditLayout && best ? numberedLayoutScore(best) : undefined })
      accumulate(measured.candidate.timings)
      if (globalThis.__m3nTraceWidths) console.log('width-done ' + JSON.stringify({width,pages:measured.candidate.pageCount,rows:measured.candidate.rows,ms:measured.candidate.timings.totalMs}))
      return measured.candidate
    } catch (error) { accumulate(error.timings); throw error }
  }, { prune: prune && !auditLayout, candidatePolicy:globalThis.__m3nProductionWidthPolicy ? optimizedScoreWidthPolicy : undefined })
  let exactWinner
  if (globalThis.__m3nExperimentalRowReuse) {
    const fastCeiling = globalThis.__m3nExperimentalGreedyCeiling
    globalThis.__m3nExperimentalRowReuse = false
    globalThis.__m3nExperimentalGreedyCeiling = false
    try {
      const verified = await verifyEstimatedWidthCandidates(result.candidates,width=>measureNumberedWidth(score,width,{settings,detailedTimings}).candidate,{verifyWidestWhenMultipage:true})
      exactWinner = verified.best
      result.verifiedCandidates = verified.verifiedCandidates
      result.verificationFailures = verified.failures
      result.renderCache.finalExactMs = verified.ms
      result.renderCache.finalExactRequests = verified.requests
    }
    finally { globalThis.__m3nExperimentalRowReuse = true; globalThis.__m3nExperimentalGreedyCeiling = fastCeiling }
  }
  const searchMs = performance.now() - searchStarted
  const best = exactWinner ?? (auditLayout ? measureNumberedWidth(score, result.best.width, { settings, auditLayout: true }).candidate : result.best)
  return { timings, renderCache: { ...result.renderCache, strategy: result.renderCache.strategy + (pageConstrainedBreaks ? '-page-bound' : '') + (numericLayout ? '-numeric' : '') }, textMeasureCalls: detailedTimings ? timings.textMeasureCalls ?? 0 : undefined,
    textMeasureCacheHits: detailedTimings ? timings.textMeasureCacheHits ?? 0 : undefined,
    searchMs, totalMs: performance.now() - started, width: best.width, pages: best.pageCount, rows: best.rows,
    meanRhythmicGap: best.meanRhythmicGap, spacingUnevenCost: best.spacingUnevenCost, spacingMeanUnevenCost: best.spacingMeanUnevenCost, spacingCrampedCost: best.spacingCrampedCost, spacingExpandedCost: best.spacingExpandedCost, spacingCost: best.spacingCost,
    layoutCost: best.layoutCost, lineStretchCost: best.lineStretchCost, lineUniformityCost: best.lineUniformityCost, fontSizeCost: best.fontSizeCost, totalCost: best.totalCost,
    outside: best.outside, overlaps: best.overlaps,
    ...(result.verifiedCandidates ? { verifiedCandidates: result.verifiedCandidates, verificationFailures: result.verificationFailures } : {}),
    candidates: result.candidates.map(({ width, pageCount, rows, spacingCost, meanRhythmicGap, spacingUnevenCost, spacingMeanUnevenCost, spacingCrampedCost, spacingExpandedCost, layoutCost, lineStretchCost, lineUniformityCost, fontSizeCost, totalCost, error }) => ({ width, pages: pageCount, rows, spacingCost, meanRhythmicGap, spacingUnevenCost, spacingMeanUnevenCost, spacingCrampedCost, spacingExpandedCost, layoutCost, lineStretchCost, lineUniformityCost, fontSizeCost, totalCost, error })) }
}
