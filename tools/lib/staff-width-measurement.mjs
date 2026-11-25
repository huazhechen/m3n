import { scoreLayoutConfig } from '@m3n/numbered-notation/layout-config'
import { prepareStaffScore } from '@m3n/score-renderer/staff'
import { a4SourcePageHeight } from '@m3n/score-renderer'
import { auditStaffInkCollisions, auditStaffSystemCollisions, staffInkBounds } from './staff-ink-collisions.mjs'
import { numberedLayoutScore } from '../scorebook-width.mjs'

/** Staff-specific geometry adapter; width enumeration, safety filtering and
 * ranking belong to the same policy used for numbered notation. */
export async function measureStaffWidth(score, width, settings = {}, signal, { auditLayout = false, task, onPrepared } = {}) {
  const started = performance.now(), timings = {}
  const render = await prepareStaffScore(score, { ...settings, width }, signal, task)
  onPrepared?.(render)
  const info = render.layoutInfo()
  const densities = info.lines.map(line => line.minimum / info.availableWidth)
  const mean = densities.reduce((sum, density) => sum + density, 0) / Math.max(1, densities.length)
  const lineDensityVariation = Math.sqrt(densities.reduce((sum, density) => sum + (density - mean) ** 2, 0) / Math.max(1, densities.length)) / Math.max(mean, Number.EPSILON)
  const lastLineSlack = info.lines.length ? Math.max(0, Math.min(1, 1 - info.lines.at(-1).target / info.availableWidth)) : 0
  const pageCount = render.pageCount(true)
  timings.layoutMs = performance.now() - started
  const qualityScore = numberedLayoutScore({ width, lineDensityVariation, lastLineSlack })
  if (!auditLayout) {
    timings.totalMs = performance.now() - started
    return { width, pageCount, rows: info.lines.length, outside: [], overlaps: [], lineDensityVariation, lastLineSlack, qualityScore, timings }
  }
  let stage = performance.now()
  const pages = render(true)
  timings.svgRenderMs = performance.now() - stage
  if (pages.length !== pageCount || !pageCount) throw new Error('Staff pagination mismatch')
  const host = document.createElement('div')
  host.style.cssText = `position:absolute;left:${scoreLayoutConfig.rendering.auditOffscreenPosition}px;top:0`
  document.body.append(host)
  const outside = [], overlaps = []
  try {
    stage = performance.now()
    host.replaceChildren(...pages)
    await document.fonts.ready
    signal?.throwIfAborted()
    timings.svgMountMs = performance.now() - stage
    stage = performance.now()
    pages.forEach((svg, index) => {
      const box = svg.viewBox.baseVal, ink = staffInkBounds(svg)
      if (![box.width, box.height, ink.x, ink.y, ink.width, ink.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) throw new Error('Invalid staff SVG geometry')
      for (const [row, system] of [...svg.querySelectorAll('g.system')].entries())
        for (const collision of auditStaffInkCollisions(system).collisions) overlaps.push({ page: index + 1, row: row + 1, ...collision })
      for (const collision of auditStaffSystemCollisions(svg).collisions) overlaps.push({ page: index + 1, betweenSystems: true, ...collision })
      const tolerance = (box.width / width) * 2
      if (ink.x < -tolerance || ink.y < -tolerance || ink.x + ink.width > box.width + tolerance || ink.y + ink.height > box.height + tolerance || Number(svg.getAttribute('height')) > a4SourcePageHeight(width) + 2)
        outside.push({ page: index + 1, viewBox: [box.width, box.height], ink: [ink.x, ink.y, ink.width, ink.height], height: Number(svg.getAttribute('height')) })
    })
    timings.geometryMs = performance.now() - stage
    timings.totalMs = performance.now() - started
    return { width, pageCount, rows: info.lines.length, outside, overlaps, lineDensityVariation, lastLineSlack,
      qualityScore, timings }
  } finally { host.remove() }
}
