import { parseM3NDocument } from '@m3n/notation'
import { prepareNumberedNotationFonts, renderSharedNumberedNotationScores } from '@m3n/numbered-notation'
import { a4ImagePlacement } from '@m3n/score-renderer/view'
import { renderScoreInto } from '../src/lib/render-score'
import { createSvgInkMeasurer } from './lib/svg-ink-bounds.mjs'

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
  const naturalHeight = !paged && pages.length === 1 ? pages[0].viewBox.baseVal.height : undefined
  const outside = [], overlaps = []
  const ink = createSvgInkMeasurer()
  let rows = 0
  for (const [index, svg] of pages.entries()) {
    const view = svg.viewBox.baseVal
    const paper = { left: view.x, top: view.y, right: view.x + view.width, bottom: view.y + view.height }
    rows += svg.querySelectorAll('g.system').length
    for (const node of svg.querySelectorAll('text,path,line,circle,rect,polygon,ellipse')) {
      if (node.closest('defs')) continue
      const box = ink(node)
      // Native page routing can include a primitive touching a page boundary
      // but wholly visible on the neighbouring page. It is clipped here.
      if (box.y >= paper.bottom || box.y + box.height <= paper.top) continue
      if (box.width && box.height && (box.x < paper.left - .75 || box.x + box.width > paper.right + .75 || box.y < paper.top - .75 || box.y + box.height > paper.bottom + .75)) {
        outside.push({ page: index + 1, tag: node.tagName, text: node.textContent, box: [box.x - paper.left, box.y - paper.top, box.width, box.height] })
      }
    }
    for (const selector of ['text[data-m3n-role="lyric"],text[data-m3n-role="lyric-prefix"]', 'g.note text']) {
      const nodes = [...svg.querySelectorAll(selector)].filter(node => node.textContent.trim() && (selector[0] !== 'g' || /^[0-7]$/.test(node.textContent)))
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = ink(nodes[i]), b = ink(nodes[j])
        if (Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > .5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > .5) {
          overlaps.push({ page: index + 1, a: nodes[i].textContent, b: nodes[j].textContent })
        }
      }
    }
  }
  const result = { width, pageCount: pages.length, rows, outside, overlaps }
  if (!paged) return { ...result, naturalHeight }
  if (pages.length === 1 && !outside.length && !overlaps.length) {
    const markup = pages[0].outerHTML
    const continuous = await measure(source, width, false, undefined, host)
    if (!continuous.outside.length && !continuous.overlaps.length) result.naturalHeight = continuous.naturalHeight
    host.innerHTML = markup
  }
  return result
}

/** Fit whole scores at one shared core parameter before A4 placement. */
export async function sharedA4Page(sources, width, gap = 22, host = document.querySelector('#scratch')) {
  if (sources.length < 2) throw new Error('A shared page needs at least two scores')
  const pxPerMm = 96 / 25.4, scale = 186 / width
  await prepareNumberedNotationFonts(sources)
  const fitted = renderSharedNumberedNotationScores(sources.map(source => parseM3NDocument(source)), { width, pageMargin: 0 }, gap)
  host.innerHTML = fitted.markup.join('')
  const pages = [...host.querySelectorAll(':scope > svg')]
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
