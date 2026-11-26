import { analyzeM3N } from '@m3n/notation'
import { prepareNumberedNotationFonts, NumberedLayoutTask, NumberedTextMeasurementCache } from '@m3n/numbered-notation'
import { selectBestWidth } from './scorebook-width.mjs'
import { measureNumberedWidth } from './lib/numbered-width-measurement.mjs'

export async function search(source, auditLayout = false) {
  const analysis = analyzeM3N(source)
  if (analysis.diagnostics.some(item => item.severity === 'error')) throw new Error('Invalid score source')
  const score = analysis.score
  await prepareNumberedNotationFonts(score)
  const settings = { layoutTask: new NumberedLayoutTask(), textMeasurementCache: new NumberedTextMeasurementCache() }
  const result = await selectBestWidth(width => measureNumberedWidth(score, width, { settings }).candidate)
  const best = auditLayout ? measureNumberedWidth(score, result.best.width, { settings, auditLayout: true }).candidate : result.best
  return { width: best.width, pages: best.pageCount, rows: best.rows,
    outside: best.outside, overlaps: best.overlaps,
    candidates: result.candidates.map(({ width, pageCount, rows, error }) => ({ width, pages: pageCount, rows, error })) }
}
