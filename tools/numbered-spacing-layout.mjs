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

export async function search(source, auditLayout = false, prune = false) {
  const started = performance.now()
  const analysis = analyzeM3N(source)
  if (analysis.diagnostics.some(item => item.severity === 'error')) throw new Error('Invalid score source')
  const score = analysis.score
  await prepareNumberedNotationFonts(score)
  const settings = { layoutTask: new NumberedLayoutTask(), textMeasurementCache }
  const searchStarted = performance.now()
  const result = await selectBestWidth((width, best) => measureNumberedWidth(score, width, { settings,
    minimumQuality: prune && !auditLayout && best?.pageCount === 1 ? numberedLayoutScore(best) : undefined }).candidate,
    { prune: prune && !auditLayout })
  const timings = {}
  for (const candidate of result.candidates) for (const [key, value] of Object.entries(candidate.timings ?? {}))
    if (typeof value === 'number') timings[key] = key.includes('Maximum') ? Math.max(timings[key] ?? 0, value) : (timings[key] ?? 0) + value
  const searchMs = performance.now() - searchStarted
  const best = auditLayout ? measureNumberedWidth(score, result.best.width, { settings, auditLayout: true }).candidate : result.best
  return { timings, renderCache: result.renderCache, textMeasureCalls: result.candidates.reduce((sum, c) => sum + (c.timings?.textMeasureCalls ?? 0), 0),
    textMeasureCacheHits: result.candidates.reduce((sum, c) => sum + (c.timings?.textMeasureCacheHits ?? 0), 0),
    searchMs, totalMs: performance.now() - started, width: best.width, pages: best.pageCount, rows: best.rows,
    meanRhythmicGap: best.meanRhythmicGap, spacingUnevenCost: best.spacingUnevenCost, spacingCrampedCost: best.spacingCrampedCost, spacingCost: best.spacingCost,
    layoutCost: best.layoutCost, lineStretchCost: best.lineStretchCost, lineUniformityCost: best.lineUniformityCost, fontSizeCost: best.fontSizeCost, totalCost: best.totalCost,
    outside: best.outside, overlaps: best.overlaps,
    candidates: result.candidates.map(({ width, pageCount, rows, spacingCost, meanRhythmicGap, spacingUnevenCost, spacingCrampedCost, layoutCost, lineStretchCost, lineUniformityCost, fontSizeCost, totalCost, error }) => ({ width, pages: pageCount, rows, spacingCost, meanRhythmicGap, spacingUnevenCost, spacingCrampedCost, layoutCost, lineStretchCost, lineUniformityCost, fontSizeCost, totalCost, error })) }
}
