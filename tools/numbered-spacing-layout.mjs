import { analyzeM3N } from '@m3n/notation'
import { prepareNumberedNotationFonts, registerScoreFontBundle, NumberedLayoutTask, NumberedTextMeasurementCache } from '@m3n/numbered-notation'
import { selectBestWidth, numberedLayoutScore } from './scorebook-width.mjs'
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

export async function search(source, auditLayout = false, prune = false, localRefine = false, pageConstrainedBreaks = false, rowEnvelope = false) {
  const started = performance.now()
  const analysis = analyzeM3N(source)
  if (analysis.diagnostics.some(item => item.severity === 'error')) throw new Error('Invalid score source')
  const score = analysis.score
  await prepareNumberedNotationFonts(score)
  const settings = { rowEnvelope, pageConstrainedBreaks: pageConstrainedBreaks || rowEnvelope, layoutTask: new NumberedLayoutTask(), textMeasurementCache }
  const searchStarted = performance.now()
  const timings = {}
  const accumulate = partial => {
    for (const [key, value] of Object.entries(partial ?? {}))
      if (typeof value === 'number') timings[key] = key.includes('Maximum') ? Math.max(timings[key] ?? 0, value) : (timings[key] ?? 0) + value
  }
  const result = await selectBestWidth((width, best) => {
    try {
      const measured = measureNumberedWidth(score, width, { settings,
        minimumQuality: prune && !auditLayout && best?.pageCount === 1 ? numberedLayoutScore(best) : undefined })
      accumulate(measured.candidate.timings)
      return measured.candidate
    } catch (error) { accumulate(error.timings); throw error }
  }, { prune: prune && !auditLayout, localRefine: localRefine && !auditLayout })
  const searchMs = performance.now() - searchStarted
  const best = auditLayout ? measureNumberedWidth(score, result.best.width, { settings, auditLayout: true }).candidate : result.best
  return { timings, renderCache: { ...result.renderCache, strategy: result.renderCache.strategy + (pageConstrainedBreaks || rowEnvelope ? '-page-bound' : '') + (rowEnvelope ? '-row-envelope-03' : '') }, textMeasureCalls: timings.textMeasureCalls ?? 0,
    textMeasureCacheHits: timings.textMeasureCacheHits ?? 0,
    searchMs, totalMs: performance.now() - started, width: best.width, pages: best.pageCount, rows: best.rows,
    meanRhythmicGap: best.meanRhythmicGap, spacingUnevenCost: best.spacingUnevenCost, spacingCrampedCost: best.spacingCrampedCost, spacingCost: best.spacingCost,
    layoutCost: best.layoutCost, lineStretchCost: best.lineStretchCost, lineUniformityCost: best.lineUniformityCost, fontSizeCost: best.fontSizeCost, totalCost: best.totalCost,
    outside: best.outside, overlaps: best.overlaps,
    candidates: result.candidates.map(({ width, pageCount, rows, spacingCost, meanRhythmicGap, spacingUnevenCost, spacingCrampedCost, layoutCost, lineStretchCost, lineUniformityCost, fontSizeCost, totalCost, error }) => ({ width, pages: pageCount, rows, spacingCost, meanRhythmicGap, spacingUnevenCost, spacingCrampedCost, layoutCost, lineStretchCost, lineUniformityCost, fontSizeCost, totalCost, error })) }
}
