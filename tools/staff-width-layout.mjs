import { scoreLayoutConfig } from '@m3n/numbered-notation/layout-config'
import { analyzeM3N } from '@m3n/notation'
import { prepareStaffResources, prepareStaffScore, prepareStaffMeasurementTask } from '@m3n/score-renderer/staff'
import { measureStaffWidth } from './lib/staff-width-measurement.mjs'
import { probeWidthCandidates, chooseBestWidth, numberedLayoutScore } from './scorebook-width.mjs'

export async function prepare() {
  await prepareStaffResources()
}

function readScore(source) {
  const analysis = analyzeM3N(source)
  if (analysis.diagnostics.some((item) => item.severity === 'error')) throw new Error('Invalid score source')
  return analysis.score
}

export async function search(source, { auditLayout = false, prune = !auditLayout, localRefine = !auditLayout } = {}) {
  const started = performance.now()
  const score = readScore(source)
  const task = await prepareStaffMeasurementTask(score)
  const result = await probeWidthCandidates((width, best) => measureStaffWidth(score, width, {}, undefined, { auditLayout, task, minimumQuality: prune && !auditLayout && best ? numberedLayoutScore(best) : undefined, maximumPageCount: best?.pageCount }), { prune: prune && !auditLayout, localRefine: localRefine && !auditLayout })
  const searchMs = performance.now() - started
  return { ...result, searchMs }
}

export async function measure(source, width, verify = false, settings = {}) {
  return measureStaffWidth(readScore(source), width, settings, undefined, { auditLayout: verify })
}

export async function preview(source,width,settings = {}) {
 const render=await prepareStaffScore(readScore(source),{...settings,width})
 const host=document.createElement('main');document.body.replaceChildren(host)
 const pages=render(true);host.replaceChildren(...pages)
 pages.forEach(svg=>{svg.style.display='block';svg.style.marginBottom=`${scoreLayoutConfig.rendering.previewPageGap}px`})
 return pages.map(svg=>svg.outerHTML)
}

/** Shared all-score benchmark adapter; one browser and font cache per batch. */
export { initialize } from './numbered-spacing-layout.mjs'
export async function searchSpacing(source, auditLayout = false, prune = false, localRefine = false) {
  const started = performance.now()
  const result = await search(source, { auditLayout, prune, localRefine })
  const best = chooseBestWidth(result.candidates)
  if (!best) throw new Error('没有可用的五线谱排版候选。' + JSON.stringify(result.candidates))
  return { ...best, pages: best.pageCount, searchMs: result.searchMs,
    totalMs: performance.now() - started, candidates: result.candidates, renderCache: result.renderCache }
}
