import { analyzeM3N, A4_CONTENT_WIDTH_MM } from '@m3n/notation'
import { prepareNumberedNotationFonts, scoreLayoutConfig, SCORE_NUMBER_FONT, SCORE_TEXT_FONT } from '@m3n/numbered-notation'
import { measureNumberedWidth } from './lib/numbered-width-measurement.mjs'
import { measureStaffWidth } from './lib/staff-width-measurement.mjs'

/** Compare the same written source and physical page width, without auto-width. */
export async function compare(source, width, { auditLayout = true, staffMusic = scoreLayoutConfig.staff.music, includeSvg = false } = {}) {
  const original = scoreLayoutConfig.staff.music
  scoreLayoutConfig.staff.music = staffMusic
  try { return await compareAtSize(source, width, auditLayout, includeSvg) }
  finally { scoreLayoutConfig.staff.music = original }
}

async function compareAtSize(source, width, auditLayout, includeSvg) {
  const analysis = analyzeM3N(source)
  if (analysis.diagnostics.some(item => item.severity === 'error')) throw new Error('Invalid score source')
  const score = analysis.score
  await prepareNumberedNotationFonts(score)
  const numbered = measureNumberedWidth(score, width, { auditLayout })
  let render
  const staff = await measureStaffWidth(score, width, {}, undefined, { auditLayout, onPrepared(value) { render = value } })
  const info = render.layoutInfo()
  const numberedInfo = numbered.prepared.layoutInfo()
  const mmPerPx = A4_CONTENT_WIDTH_MM / width
  const context = document.createElement('canvas').getContext('2d')
  const inkHeight = (family, size, text) => {
    context.font = `${scoreLayoutConfig.fonts.regularWeight} ${size}px ${family}`
    const ink = context.measureText(text)
    return (ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent) * mmPerPx
  }
  const geometry = info => ({ displayedEvents: info.displayedEvents, hasBass: info.hasBass,
    averageCoreHeight: info.lines.reduce((sum, line) => sum + (line.core ? line.core.bottom - line.core.top : 0), 0) / Math.max(1, info.lines.length),
    averageInkHeight: info.lines.reduce((sum, line) => sum + line.inkHeight, 0) / Math.max(1, info.lines.length) })
  const summary = (candidate, meanLineDensity, naturalHeight) => ({
    pages: candidate.pageCount, rows: candidate.rows, meanLineDensity,
    lineDensityVariation: candidate.lineDensityVariation, lastLineSlack: candidate.lastLineSlack, lineStretchPenalty: candidate.lineStretchPenalty,
    naturalHeight, outside: candidate.outside, overlaps: candidate.overlaps,
  })
  return {
    ...(includeSvg ? { svg: { numbered: numbered.prepared.renderContinuous().join(''), staff: render(false).map(svg => svg.outerHTML).join('') } } : {}),
    readability: { lyricEmMm: scoreLayoutConfig.lyrics.fontSize * mmPerPx,
      lyricInkMm: inkHeight(SCORE_TEXT_FONT, scoreLayoutConfig.lyrics.fontSize, '春'),
      digitInkMm: inkHeight(SCORE_NUMBER_FONT, scoreLayoutConfig.numbered.music, '3'),
      numberedFrameMm: scoreLayoutConfig.numbered.music * 1.25 * mmPerPx,
      staffFrameMm: scoreLayoutConfig.staff.music * mmPerPx,
      staffSpaceMm: scoreLayoutConfig.staff.music / 4 * mmPerPx },
    numbered: { ...summary(numbered.candidate, numbered.prepared.quality.meanLineDensity, numbered.prepared.continuousHeight()), ...geometry(numberedInfo) },
    staff: { ...summary(staff, info.quality.meanLineDensity, render.continuousHeight()),
      spacing: info.spacing, ...geometry(info) },
  }
}
