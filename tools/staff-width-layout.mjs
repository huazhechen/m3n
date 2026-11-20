import { analyzeM3N } from '@m3n/notation'
import { prepareStaffResources, prepareStaffScore } from '@m3n/score-renderer/staff'
import { a4SourcePageHeight } from '@m3n/score-renderer'
import { auditStaffInkCollisions, auditStaffSystemCollisions, staffInkBounds } from './lib/staff-ink-collisions.mjs'
import { probeWidthCandidates } from './scorebook-width.mjs'

export async function prepare() {
  await prepareStaffResources()
}

function readScore(source) {
  const analysis = analyzeM3N(source)
  if (analysis.diagnostics.some((item) => item.severity === 'error')) throw new Error('Invalid score source')
  return analysis.score
}

export async function search(source) {
  const score = readScore(source)
  const render = await prepareStaffScore(score, {})
  return probeWidthCandidates(
    async (width) => ({
      width,
      pageCount: render.pageCount(true, width),
      outside: [],
      overlaps: [],
    }),
    { verify: (width) => measureScore(score, width, true) },
  )
}

export async function measure(source, width, verify = false, settings = {}) {
  return measureScore(readScore(source), width, verify, settings)
}

async function measureScore(score, width, verify = false, settings = {}) {
  const render = await prepareStaffScore(score, { ...settings, width })
  const pageCount = render.pageCount(true)
  if (!verify) return { width, pageCount }
  const pages = render(true)
  if (pages.length !== pageCount || !pageCount) throw new Error('Staff pagination mismatch')
  const outside = [],
    overlaps = []
  const host = document.createElement('div')
  document.body.append(host)
  try {
    host.replaceChildren(...pages)
    await document.fonts.ready
    pages.forEach((svg, index) => {
      const box = svg.viewBox.baseVal,
        ink = staffInkBounds(svg)
      if (
        ![box.width, box.height, ink.x, ink.y, ink.width, ink.height].every(Number.isFinite) ||
        box.width <= 0 ||
        box.height <= 0
      )
        throw new Error('Invalid staff SVG geometry')
      const systemNodes = [...svg.querySelectorAll('g.system')]
      for (const [row, system] of systemNodes.entries())
        for (const collision of auditStaffInkCollisions(system).collisions)
          overlaps.push({ page: index + 1, row: row + 1, ...collision })
      for (const collision of auditStaffSystemCollisions(svg).collisions)
        overlaps.push({ page: index + 1, betweenSystems: true, ...collision })
      const tolerance = (box.width / width) * 2
      if (
        ink.x < -tolerance ||
        ink.y < -tolerance ||
        ink.x + ink.width > box.width + tolerance ||
        ink.y + ink.height > box.height + tolerance ||
        Number(svg.getAttribute('height')) > a4SourcePageHeight(width) + 2
      )
        outside.push({
          page: index + 1,
          viewBox: [box.width, box.height],
          ink: [ink.x, ink.y, ink.width, ink.height],
          height: Number(svg.getAttribute('height')),
        })
    })
    return { width, pageCount, outside, overlaps }
  } finally {
    host.remove()
  }
}

export async function preview(source,width,settings = {}) {
 const render=await prepareStaffScore(readScore(source),{...settings,width})
 const host=document.createElement('main');document.body.replaceChildren(host)
 const pages=render(true);host.replaceChildren(...pages)
 pages.forEach(svg=>{svg.style.display='block';svg.style.marginBottom='16px'})
 return pages.map(svg=>svg.outerHTML)
}
