import { parseM3NDocument } from '@m3n/notation'
import { prepareNumberedNotationFonts, renderSharedNumberedNotationScores } from '@m3n/numbered-notation'
import { a4ImagePlacement } from '@m3n/score-renderer/view'
import { attachScoreReading } from '../src/lib/score-reading-dom'
import { renderScoreInto } from '../src/lib/render-score'
import { describeAccessibleScore } from '../src/lib/score-accessibility'
import { PreparedNumberedNotationScore } from '@m3n/numbered-notation'
import { numberedLayoutScore } from './scorebook-width.mjs'
import { inspectScorePages } from './lib/score-geometry.mjs'

export async function prepare(fontBase64) {
  // Publishing supplies a freshly generated subset for the actual book text.
  if (fontBase64) {
    const font = new FontFace('Noto Sans SC', `url(data:font/ttf;base64,${fontBase64})`)
    await font.load()
    document.fonts.add(font)
  }
  await prepareNumberedNotationFonts()
}

export async function render(source, width, paged = true, coreGap, host = document.querySelector('#scratch')) {
  await renderScoreInto(host, { scoreDocument: parseM3NDocument(source), width, paged, coreGap })
  return [...host.querySelectorAll(':scope > svg')]
}

// Keep only the current song: candidate widths share parsing and font preparation.
let measurementSource, measurementDocument, measurementDescription
async function prepareMeasurement(source) {
  if (source !== measurementSource) {
    const document = parseM3NDocument(source)
    await prepareNumberedNotationFonts(document)
    measurementSource = source
    measurementDocument = document
    measurementDescription = describeAccessibleScore(document, { forDisplay: true })
  }
  return measurementDocument
}

export async function measure(source, width, paged = true, coreGap, host = document.querySelector('#scratch')) {
  const started = performance.now(), timings = {}
  let stage = started
  const scoreDocument = await prepareMeasurement(source)
  timings.parseFontsMs = performance.now() - stage; stage = performance.now()
  const score = new PreparedNumberedNotationScore(scoreDocument, { width, pageMargin: 0 }, timings)
  timings.layoutMs = performance.now() - stage; stage = performance.now()
  const quality = score.quality
  timings.qualityMs = performance.now() - stage; stage = performance.now()
  const markup = (paged ? score.renderPaged(coreGap) : score.renderContinuous(coreGap)).join('')
  timings.svgRenderMs = performance.now() - stage; stage = performance.now()
  host.innerHTML = markup
  attachScoreReading(host, measurementDescription)
  const pages = [...host.querySelectorAll(':scope > svg')]
  timings.svgMountMs = performance.now() - stage
  // Keep the aggregate render stage for comparisons with the old renderer.
  timings.pagedRenderMs = timings.parseFontsMs + timings.layoutMs + timings.svgRenderMs + timings.svgMountMs
  const { outside, overlaps } = inspectScorePages(pages, timings)
  const rows = pages.reduce((sum, svg) => sum + svg.querySelectorAll('g.system').length, 0)
  const result = { width, timings, pageCount: pages.length, rows, outside, overlaps,
    lineDensityVariation: quality.lineDensityVariation, lastLineSlack: quality.lastLineSlack,
    qualityScore: numberedLayoutScore({ width, ...quality }) }
  if (!paged) result.naturalHeight = pages.length === 1 ? pages[0].viewBox.baseVal.height : undefined
  if (paged && pages.length === 1 && !outside.length && !overlaps.length) {
    stage = performance.now()
    const markup = pages[0].outerHTML
    const continuousTimings = {}
    const continuousStarted = performance.now()
    const continuousMarkup = score.renderContinuous().join('')
    continuousTimings.svgRenderMs = performance.now() - continuousStarted
    const mountStarted = performance.now()
    host.innerHTML = continuousMarkup
    attachScoreReading(host, measurementDescription)
    const continuousPages = [...host.querySelectorAll(':scope > svg')]
    continuousTimings.svgMountMs = performance.now() - mountStarted
    const continuous = inspectScorePages(continuousPages, continuousTimings)
    continuousTimings.totalMs = performance.now() - continuousStarted
    result.outside.push(...continuous.outside)
    result.overlaps.push(...continuous.overlaps)
    if (!continuous.outside.length && !continuous.overlaps.length) result.naturalHeight = continuousPages[0].viewBox.baseVal.height
    host.innerHTML = markup
    timings.continuousMs = performance.now() - stage
    timings.continuous = continuousTimings
  }
  timings.totalMs = performance.now() - started
  return result
}

/** Fit whole scores at one shared core parameter before A4 placement. */
export async function sharedA4Page(sources, width, gap = 22, host = document.querySelector('#scratch')) {
  if (sources.length < 2) throw new Error('A shared page needs at least two scores')
  const pxPerMm = 96 / 25.4, scale = 186 / width
  const documents = sources.map(source => parseM3NDocument(source))
  for (const document of documents) await prepareNumberedNotationFonts(document)
  const fitted = renderSharedNumberedNotationScores(documents, { width, pageMargin: 0 }, gap)
  host.innerHTML = fitted.markup.join('')
  const pages = [...host.querySelectorAll(':scope > svg')]
  const safety = inspectScorePages(pages)
  if (safety.outside.length || safety.overlaps.length) throw new Error(`Unsafe shared page: ${JSON.stringify(safety)}`)
  const items = []
  let top = 0
  for (const svg of pages) {
    const view = svg.viewBox.baseVal
    if (view.width !== width) throw new Error('Shared scores must have the same width')
    const height = view.height
    const placement = { x: 12, y: 12 + top * scale, width: 186, height: height * scale }
    for (const key of ['x', 'y', 'width', 'height']) svg.setAttribute(key, String(placement[key] * pxPerMm))
    items.push({ markup: svg.outerHTML, sourceWidth: width, sourceHeight: height, top, placement })
    top += height + fitted.scoreGap
  }
  const usedHeight = top - fitted.scoreGap + fitted.trailingGap
  if (usedHeight > Math.floor(width * 273 / 186) + .001) throw new Error('Shared page exceeds A4 content height')
  return { markup: items.map(item => item.markup).join(''), items, width, usedHeight, coreGap: fitted.coreGap, scoreGap: fitted.scoreGap, trailingGap: fitted.trailingGap }
}

/** The same 12mm A4 placement used by the web PDF download, without cropping. */
export async function a4Pages(source, width, host = document.querySelector('#scratch')) {
  const pages = await render(source, width, true, undefined, host)
  const pxPerMm = 96 / 25.4
  return pages.map(svg => {
    const { width: sourceWidth, height: sourceHeight } = svg.viewBox.baseVal
    const placement = a4ImagePlacement(sourceWidth, sourceHeight)
    for (const key of ['x', 'y', 'width', 'height']) svg.setAttribute(key, String(placement[key] * pxPerMm))
    return { markup: svg.outerHTML, sourceWidth, sourceHeight, placement }
  })
}
