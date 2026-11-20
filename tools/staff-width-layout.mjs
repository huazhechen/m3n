import { analyzeM3N } from '@m3n/notation'
import { prepareStaffResources, prepareStaffScore } from '@m3n/score-renderer/staff'
import { a4SourcePageHeight } from '@m3n/score-renderer'
import { probeWidthCandidates } from './scorebook-width.mjs'

export async function prepare() { await prepareStaffResources() }

function readScore(source) {
  const analysis = analyzeM3N(source)
  if (analysis.diagnostics.some(item => item.severity === 'error')) throw new Error('Invalid score source')
  return analysis.score
}

export async function search(source) {
  const score = readScore(source)
  const render = await prepareStaffScore(score, {})
  return probeWidthCandidates(async width => ({
    width, pageCount: render.pageCount(true, width), outside: [], overlaps: [],
  }))
}

export async function measure(source, width, verify = false) {
  return measureScore(readScore(source), width, verify)
}

async function measureScore(score, width, verify = false) {
  const render = await prepareStaffScore(score, { width })
  const pageCount = render.pageCount(true)
  if (!verify) return { width, pageCount }
  const pages = render(true)
  if (pages.length !== pageCount || !pageCount) throw new Error('Staff pagination mismatch')
  const outside = []
  const host = document.createElement('div')
  document.body.append(host)
  try {
    host.replaceChildren(...pages)
    await document.fonts.ready
    pages.forEach((svg, index) => {
      const box = svg.viewBox.baseVal, ink = svg.getBBox()
      if (![box.width, box.height, ink.x, ink.y, ink.width, ink.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) throw new Error('Invalid staff SVG geometry')
      const tolerance = box.width / width * 2
      if (ink.x < -tolerance || ink.y < -tolerance || ink.x + ink.width > box.width + tolerance || ink.y + ink.height > box.height + tolerance || Number(svg.getAttribute('height')) > a4SourcePageHeight(width) + 2) outside.push(index + 1)
    })
    return { width, pageCount, outside }
  } finally { host.remove() }
}
