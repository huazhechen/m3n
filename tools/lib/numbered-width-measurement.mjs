import { PreparedNumberedNotationScore } from '@m3n/numbered-notation'
import { numberedLayoutScore } from '../scorebook-width.mjs'
import { inspectScorePages } from './score-geometry.mjs'

/** One candidate measurement for reader, online PDF and local PDF. Fonts are
 * prepared once by the caller. A supplied host may retain the measured pages. */
export function measureNumberedWidth(documentScore, width, { settings = {}, host, afterMount, paged = true, signal } = {}) {
  signal?.throwIfAborted()
  const started = performance.now(), timings = {}
  const ownsHost = !host
  host ??= document.createElement('div')
  if (ownsHost) {
    host.style.cssText = 'position:absolute;left:-100000px;top:0'
    document.body.append(host)
  }
  const mount = markup => {
    const started = performance.now()
    host.innerHTML = markup
    afterMount?.(host)
    return { pages: [...host.querySelectorAll(':scope > svg')], ms: performance.now() - started }
  }
  try {
    const prepared = new PreparedNumberedNotationScore(documentScore, { ...settings, width, pageMargin: settings.pageMargin ?? 0 }, timings)
    signal?.throwIfAborted()
    timings.layoutMs = performance.now() - started
    let stage = performance.now()
    const markup = (paged ? prepared.renderPaged(settings.coreGap) : prepared.renderContinuous(settings.coreGap)).join('')
    timings.svgRenderMs = performance.now() - stage
    const mounted = mount(markup), pages = mounted.pages
    timings.svgMountMs = mounted.ms
    const quality = prepared.quality
    const candidate = { width, timings, pageCount: pages.length,
      rows: pages.reduce((sum, svg) => sum + svg.querySelectorAll('g.system').length, 0),
      ...inspectScorePages(pages, timings), lineDensityVariation: quality.lineDensityVariation,
      lastLineSlack: quality.lastLineSlack, qualityScore: numberedLayoutScore({ width, ...quality }) }
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
