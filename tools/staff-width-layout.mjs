import { analyzeM3N } from '@m3n/notation'
import { prepareStaffResources, prepareStaffScore, prepareStaffMeasurementTask } from '@m3n/score-renderer/staff'
import { measureStaffWidth } from './lib/staff-width-measurement.mjs'
import { probeWidthCandidates } from './scorebook-width.mjs'

export async function prepare() {
  await prepareStaffResources()
}

function readScore(source) {
  const analysis = analyzeM3N(source)
  if (analysis.diagnostics.some((item) => item.severity === 'error')) throw new Error('Invalid score source')
  return analysis.score
}

export async function search(source, { auditLayout = false } = {}) {
  const score = readScore(source)
  const task = await prepareStaffMeasurementTask(score)
  return probeWidthCandidates(width => measureStaffWidth(score, width, {}, undefined, { auditLayout, task }))
}

export async function measure(source, width, verify = false, settings = {}) {
  return measureStaffWidth(readScore(source), width, settings, undefined, { auditLayout: verify })
}

export async function preview(source,width,settings = {}) {
 const render=await prepareStaffScore(readScore(source),{...settings,width})
 const host=document.createElement('main');document.body.replaceChildren(host)
 const pages=render(true);host.replaceChildren(...pages)
 pages.forEach(svg=>{svg.style.display='block';svg.style.marginBottom='16px'})
 return pages.map(svg=>svg.outerHTML)
}
