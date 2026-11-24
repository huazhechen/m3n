import { parseM3NDocument } from '@m3n/notation'
import { prepareNumberedNotationFonts, renderSharedNumberedNotationScores } from '@m3n/numbered-notation'
import { a4ImagePlacement } from '@m3n/score-renderer/view'
import { attachScoreReading } from '../src/lib/score-reading-dom'
import { renderScoreInto } from '../src/lib/render-score'
import { describeAccessibleScore } from '../src/lib/score-accessibility'
import { inspectScorePages } from './lib/score-geometry.mjs'
import { measureNumberedWidth } from './lib/numbered-width-measurement.mjs'

export async function prepare(fontBase64) {
  // Publishing supplies a freshly generated subset for the actual book text.
  if (fontBase64) {
    const font = new FontFace('Noto Sans SC', `url(data:font/ttf;base64,${fontBase64})`)
    await font.load()
    document.fonts.add(font)
  }
  await prepareNumberedNotationFonts()
}

/** Finish the book's font installation before any width is measured. Later
 * overlapping CJK subsets must not change canvas metrics between songs. */
export async function prepareSources(sources) {
  for (const source of sources) await prepareNumberedNotationFonts(parseM3NDocument(source))
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

export async function measure(source, width, paged = true, coreGap, host = document.querySelector('#scratch'), auditLayout = false) {
  const started = performance.now()
  const scoreDocument = await prepareMeasurement(source)
  const parseFontsMs = performance.now() - started
  const { candidate } = measureNumberedWidth(scoreDocument, width, { host, paged, auditLayout, settings: { coreGap },
    afterMount: host => attachScoreReading(host, measurementDescription) })
  candidate.timings.parseFontsMs = parseFontsMs
  candidate.timings.totalMs += parseFontsMs
  return candidate
}

export function auditWidth(source, width, paged = true, coreGap, host = document.querySelector('#scratch')) {
  return measure(source, width, paged, coreGap, host, true)
}

export async function sharedA4Page(sources, width, gap = 22, host = document.querySelector('#scratch'), auditLayout = false) {
  if (sources.length < 2) throw new Error('A shared page needs at least two scores')
  const pxPerMm = 96 / 25.4, scale = 186 / width
  const documents = sources.map(source => parseM3NDocument(source))
  for (const document of documents) await prepareNumberedNotationFonts(document)
  const fitted = renderSharedNumberedNotationScores(documents, { width, pageMargin: 0 }, gap)
  host.innerHTML = fitted.markup.join('')
  const pages = [...host.querySelectorAll(':scope > svg')]
  const safety = auditLayout ? inspectScorePages(pages) : { outside: [], overlaps: [] }
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
