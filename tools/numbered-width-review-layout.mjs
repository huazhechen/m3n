import { analyzeM3N } from '@m3n/notation'
import { prepareNumberedNotationFonts, NumberedLayoutTask, NumberedTextMeasurementCache } from '@m3n/numbered-notation'
import { selectBestWidth, chooseBestWidth, numberedLayoutScore, widthMinimum, widthMaximum, widthStep } from './scorebook-width.mjs'
import { measureNumberedWidth } from './lib/numbered-width-measurement.mjs'
export { initialize } from './numbered-spacing-layout.mjs'

const summarize = ({ candidate, prepared }) => {
  const { timings: _timings, ...quality } = candidate
  const info = prepared.layoutInfo(), gaps = info.lines.flatMap(line => line.rhythmicGaps).sort((a, b) => a - b)
  const quantile = q => gaps[Math.floor((gaps.length - 1) * q)] ?? 0
  return { ...quality, spacing: info.spacing, measureRows: info.measureRows,
    intervals: { count: gaps.length, min: quantile(0), p10: quantile(.1), median: quantile(.5), p90: quantile(.9), max: quantile(1),
      crowded: gaps.filter(g => g < 12).length, expanded: gaps.filter(g => g > 24).length } }
}

/** Enumerate every automatic-search grid point without pruning or page caps.
 * Keep the production search separate, so missed alternatives remain visible. */
export async function review(source) {
  const started = performance.now()
  const analysis = analyzeM3N(source)
  if (analysis.diagnostics.some(item => item.severity === 'error')) throw new Error('Invalid source')
  const score = analysis.score
  await prepareNumberedNotationFonts(score)
  const settings = () => ({ layoutTask: new NumberedLayoutTask(), textMeasurementCache: new NumberedTextMeasurementCache() })
  const productionSettings = settings()
  const productionStarted = performance.now()
  const production = await selectBestWidth((width, best) => measureNumberedWidth(score, width, {
    settings: productionSettings, maximumPageCount: best?.pageCount,
    minimumQuality: best ? numberedLayoutScore(best) : undefined,
  }).candidate, { prune: true, localRefine: true })
  const productionMs = performance.now() - productionStarted
  const candidates = []
  for (let width = widthMinimum; width <= widthMaximum; width += widthStep / 4) {
    candidates.push(summarize(measureNumberedWidth(score, width, { settings: settings() })))
    if (typeof globalThis.gc === 'function') globalThis.gc()
  }
  const selected = candidates.find(candidate => candidate.width === production.best.width)
  const globalBest = chooseBestWidth(candidates)
  const larger = candidates.filter(candidate => candidate.width < selected.width && candidate.pageCount <= selected.pageCount)
  const minimum = larger[0] ?? selected
  const bestLarger = chooseBestWidth(larger)
  const sameBreak = larger.filter(candidate => JSON.stringify(candidate.measureRows) === JSON.stringify(selected.measureRows))
  const comfortable = larger.filter(candidate => candidate.spacingCrampedCost === 0 && candidate.spacingExpandedCost === 0)
  const auditWidths = new Set([selected.width, minimum.width, globalBest.width, bestLarger?.width, sameBreak[0]?.width, comfortable[0]?.width].filter(Boolean))
  const audits = []
  for (const width of auditWidths) {
    audits.push(summarize(measureNumberedWidth(score, width, { settings: settings(), auditLayout: true })))
    if (typeof globalThis.gc === 'function') globalThis.gc()
  }
  return { selected, production: production.best, productionMs, totalMs: performance.now() - started,
    globalBest, minimum, bestLarger, sameBreakMinimum: sameBreak[0], comfortableMinimum: comfortable[0], candidates, audits }
}
