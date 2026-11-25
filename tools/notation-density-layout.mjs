import { analyzeM3N } from '@m3n/notation'
import { prepareNumberedNotationFonts } from '@m3n/numbered-notation'
import { prepareStaffScore } from '@m3n/score-renderer/staff'
import { measureNumberedWidth } from './lib/numbered-width-measurement.mjs'
import { measureStaffWidth } from './lib/staff-width-measurement.mjs'

/** Compare the same written source and physical page width, without auto-width. */
export async function compare(source, width) {
  const analysis = analyzeM3N(source)
  if (analysis.diagnostics.some(item => item.severity === 'error')) throw new Error('Invalid score source')
  const score = analysis.score
  await prepareNumberedNotationFonts(score)
  const numbered = measureNumberedWidth(score, width, { auditLayout: true })
  const staff = await measureStaffWidth(score, width, {}, undefined, { auditLayout: true })
  const render = await prepareStaffScore(score, { width })
  const info = render.layoutInfo()
  const summary = (candidate, meanLineDensity, naturalHeight) => ({
    pages: candidate.pageCount, rows: candidate.rows, meanLineDensity,
    lineDensityVariation: candidate.lineDensityVariation, lastLineSlack: candidate.lastLineSlack,
    naturalHeight, outside: candidate.outside, overlaps: candidate.overlaps,
  })
  return {
    numbered: summary(numbered.candidate, numbered.prepared.quality.meanLineDensity, numbered.prepared.continuousHeight()),
    staff: { ...summary(staff, info.quality.meanLineDensity, render.continuousHeight()),
      spacing: info.spacing },
  }
}
