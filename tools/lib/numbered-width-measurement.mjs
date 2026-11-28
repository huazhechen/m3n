import { withScoreWidthCandidatePolicy } from '@m3n/numbered-notation/layout'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout-config'
import { PreparedNumberedNotationScore } from '@m3n/numbered-notation'
import { numberedLayoutScore, WidthSearchPruned } from '../scorebook-width.mjs'
import { inspectScorePages } from './score-geometry.mjs'

/** One candidate measurement for reader, online PDF and local PDF. Fonts are
 * prepared once by the caller. Production reads layout metadata only; opt-in
 * audits mount SVG without changing the layout or its avoidance constraints.
 * Summary timings stay enabled; hot-path engine counters are opt-in, or on
 * by default for audits. They do not participate in layout decisions. */
export function measureNumberedWidth(documentScore,width,options={}) {
  return withScoreWidthCandidatePolicy(options.candidatePolicy,()=>measureNumberedWidthScoped(documentScore,width,options))
}
function measureNumberedWidthScoped(documentScore, width, { settings = {}, host, afterMount, paged = true, signal, auditLayout = false, detailedTimings = auditLayout, minimumQuality, maximumPageCount } = {}) {
  signal?.throwIfAborted()
  const started = performance.now(), timings = {}
  let prepared
  try {
    const options = { ...settings, width, pageMargin: settings.pageMargin ?? 0 }
    const qualityBound = auditLayout || settings.numericLayout === false && maximumPageCount > 1 ? undefined : minimumQuality
    const pageBound = auditLayout ? undefined : maximumPageCount
    const layoutTimings = detailedTimings ? timings : undefined
    prepared = auditLayout
      ? new PreparedNumberedNotationScore(documentScore, options, layoutTimings, qualityBound, pageBound)
      : PreparedNumberedNotationScore.measure(documentScore, options, layoutTimings, qualityBound, pageBound)
  }
  catch (error) {
    if (error.code === 'M3N_WIDTH_QUALITY_PRUNED') {
      timings.layoutMs = performance.now() - started
      timings.totalMs = timings.layoutMs
      const pruned = new WidthSearchPruned()
      pruned.timings = { ...timings }
      throw pruned
    }
    throw error
  }
  signal?.throwIfAborted()
  timings.layoutMs = performance.now() - started
  const quality = prepared.quality
  if (!auditLayout) {
    const candidate = { width, pageCount: paged ? prepared.pageCount : 1, rows: prepared.systemCount,
      outside: [], overlaps: [], lineDensityVariation: quality.lineDensityVariation,
      meanRhythmicGap: quality.meanRhythmicGap, spacingUnevenCost: quality.spacingUnevenCost, spacingMeanUnevenCost: quality.spacingMeanUnevenCost, spacingWorstUnevenCost: quality.spacingWorstUnevenCost, spacingCrampedCost: quality.spacingCrampedCost, spacingExpandedCost: quality.spacingExpandedCost, spacingCost: quality.spacingCost,
      lineStretchCost: quality.lineStretchCost, lineUniformityCost: quality.lineUniformityCost,
      layoutCost: quality.layoutCost, fontSizeCost: quality.fontSizeCost, verticalCost: quality.verticalCost, totalCost: quality.totalCost, lastLineSlack: quality.lastLineSlack, lineStretchPenalty: quality.lineStretchPenalty, meanLineDensity: quality.meanLineDensity, qualityScore: numberedLayoutScore({ width, ...quality }) }
    if (!paged || prepared.pageCount === 1) {
      const heightStarted = performance.now()
      candidate.naturalHeight = prepared.continuousHeight(settings.coreGap)
      timings.continuousHeightMs = performance.now() - heightStarted
    }
    timings.totalMs = performance.now() - started
    return { candidate: { ...candidate, timings: { ...timings } }, prepared }
  }
  const ownsHost = !host
  host ??= document.createElement('div')
  if (ownsHost) {
    host.style.cssText = `position:absolute;left:${scoreLayoutConfig.rendering.auditOffscreenPosition}px;top:0`
    document.body.append(host)
  }
  const mount = markup => {
    const started = performance.now()
    host.innerHTML = markup
    afterMount?.(host)
    return { pages: [...host.querySelectorAll(':scope > svg')], ms: performance.now() - started }
  }
  try {
    let stage = performance.now()
    const markup = (paged ? prepared.renderPaged(settings.coreGap) : prepared.renderContinuous(settings.coreGap)).join('')
    timings.svgRenderMs = performance.now() - stage
    const mounted = mount(markup), pages = mounted.pages
    timings.svgMountMs = mounted.ms
    const candidate = { width, timings, pageCount: pages.length,
      rows: pages.reduce((sum, svg) => sum + svg.querySelectorAll('g.system').length, 0),
      ...inspectScorePages(pages, timings), lineDensityVariation: quality.lineDensityVariation,
      meanRhythmicGap: quality.meanRhythmicGap, spacingUnevenCost: quality.spacingUnevenCost, spacingMeanUnevenCost: quality.spacingMeanUnevenCost, spacingWorstUnevenCost: quality.spacingWorstUnevenCost, spacingCrampedCost: quality.spacingCrampedCost, spacingExpandedCost: quality.spacingExpandedCost, spacingCost: quality.spacingCost,
      lineStretchCost: quality.lineStretchCost, lineUniformityCost: quality.lineUniformityCost,
      layoutCost: quality.layoutCost, fontSizeCost: quality.fontSizeCost, verticalCost: quality.verticalCost, totalCost: quality.totalCost, lastLineSlack: quality.lastLineSlack, lineStretchPenalty: quality.lineStretchPenalty, meanLineDensity: quality.meanLineDensity, qualityScore: numberedLayoutScore({ width, ...quality }) }
    if (!paged && pages.length === 1) candidate.naturalHeight = pages[0].viewBox.baseVal.height
    if (paged && pages.length === 1 && !candidate.outside.length && !candidate.overlaps.length) {
      stage = performance.now()
      const savedMarkup = pages[0].outerHTML
      const continuousStarted = performance.now(), continuous = {}
      const markup = prepared.renderContinuous().join('')
      continuous.svgRenderMs = performance.now() - continuousStarted
      const mounted = mount(markup)
      continuous.svgMountMs = mounted.ms
      const geometry = inspectScorePages(mounted.pages, continuous)
      continuous.totalMs = performance.now() - continuousStarted
      candidate.outside.push(...geometry.outside)
      candidate.overlaps.push(...geometry.overlaps)
      if (!geometry.outside.length && !geometry.overlaps.length) candidate.naturalHeight = mounted.pages[0].viewBox.baseVal.height
      host.innerHTML = savedMarkup
      timings.continuousMs = performance.now() - stage
      timings.continuous = continuous
    }
    timings.totalMs = performance.now() - started
    // Prepared layouts may be rendered again later; keep this measurement immutable.
    candidate.timings = { ...timings, ...(timings.continuous ? { continuous: { ...timings.continuous } } : {}) }
    return { candidate, prepared }
  } finally { if (ownsHost) host.remove() }
}
