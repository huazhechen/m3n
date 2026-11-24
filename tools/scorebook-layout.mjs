import { parseM3NDocument } from '@m3n/notation'
import { prepareNumberedNotationFonts, renderSharedNumberedNotationScores } from '@m3n/numbered-notation'
import { a4ImagePlacement } from '@m3n/score-renderer/view'
import { renderScoreInto } from '../src/lib/render-score'
import { numberedLayoutQuality } from '@m3n/numbered-notation'
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

export async function measure(source, width, paged = true, coreGap, host = document.querySelector('#scratch')) {
  const pages = await render(source, width, paged, coreGap, host)
  const scoreDocument = parseM3NDocument(source)
  const quality = numberedLayoutQuality(scoreDocument, { width, paged: true, pageMargin: 0 })
  const naturalHeight = !paged && pages.length === 1 ? pages[0].viewBox.baseVal.height : undefined
  const { outside, overlaps } = inspectScorePages(pages)
  const rows = pages.reduce((sum, svg) => sum + svg.querySelectorAll('g.system').length, 0)
  const result = { width, pageCount: pages.length, rows, outside, overlaps,
    lineDensityVariation: quality.lineDensityVariation, lastLineSlack: quality.lastLineSlack,
    qualityScore: numberedLayoutScore({ width, ...quality }) }
  if (!paged) return { ...result, naturalHeight }
  if (pages.length === 1 && !outside.length && !overlaps.length) {
    const markup = pages[0].outerHTML
    const continuous = await measure(source, width, false, undefined, host)
    result.outside.push(...continuous.outside)
    result.overlaps.push(...continuous.overlaps)
    if (!continuous.outside.length && !continuous.overlaps.length) result.naturalHeight = continuous.naturalHeight
    host.innerHTML = markup
  }
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
