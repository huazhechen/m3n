import { analyzeM3N } from '@m3n/notation'
import { NumberedLayoutTask, NumberedTextMeasurementCache } from '@m3n/numbered-notation'
import { selectBestWidth, numberedLayoutScore } from './scorebook-width.mjs'
import { search } from './numbered-spacing-layout.mjs'
import { measureNumberedWidth } from './lib/numbered-width-measurement.mjs'
export { initialize } from './numbered-spacing-layout.mjs'
import { outlineScoreText } from '../packages/score-renderer/src/score-fonts.js'
import { vectorScorePdf } from '../packages/score-renderer/src/score-pdf.js'

export async function exportStyle() {
  const host = document.createElement('div')
  host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 528 760"><text x="40" y="60" font-family="Barlow Semi Condensed" font-size="24" font-weight="500" font-synthesis="none" stroke="#000" stroke-width="0.36" stroke-linejoin="round" transform="matrix(1 0 -0.21255656167 1 12.7533937 0)">A</text></svg>'
  const svg = host.firstElementChild
  const pdf = await vectorScorePdf([svg])
  await outlineScoreText(svg)
  const path = svg.querySelector('path')
  return { stroke: path.getAttribute('stroke'), width: Number(path.getAttribute('stroke-width')),
    join: path.getAttribute('stroke-linejoin'), transform: path.parentElement.getAttribute('transform'), pdf: [...new Uint8Array(await pdf.arrayBuffer())] }
}

export async function parity(source) {
  const result = await search(source, false, true, false, false, true)
  const score = analyzeM3N(source).score
  const settings = { measureNumbers: true, layoutTask: new NumberedLayoutTask(), textMeasurementCache: new NumberedTextMeasurementCache() }
  const visibleSearch = await selectBestWidth((width, best) => measureNumberedWidth(score, width, { settings,
    maximumPageCount: best?.pageCount, minimumQuality: best ? numberedLayoutScore(best) : undefined }).candidate, { prune: true })
  const { candidate, prepared } = measureNumberedWidth(score, result.width, { auditLayout: true })
  const visible = measureNumberedWidth(score, result.width, { settings: { measureNumbers: true } }).prepared
  return { width: result.width, pages: result.pages, rows: result.rows, quality: prepared.quality,
    geometry: prepared.layoutInfo(), candidates: result.candidates, outside: candidate.outside, overlaps: candidate.overlaps,
    numbersVisible: { width: visibleSearch.best.width, quality: visible.quality, geometry: visible.layoutInfo() } }
}
