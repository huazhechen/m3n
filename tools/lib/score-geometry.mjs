import { inkOverlapPairs } from './ink-overlap-pairs.mjs'
import { createSvgInkMeasurer } from './svg-ink-bounds.mjs'

/** Inspect painted SVG in a mounted browser DOM, shared by both PDF paths. */
export function inspectScorePages(pages, timings = {}) {
  const outside = [], overlaps = []
  const ink = createSvgInkMeasurer()
  for (const [index, svg] of pages.entries()) {
    const view = svg.viewBox.baseVal
    const paper = { left: view.x, top: view.y, right: view.x + view.width, bottom: view.y + view.height }
    let started = performance.now()
    for (const node of svg.querySelectorAll('text,path,line,circle,rect,polygon,ellipse')) {
      if (node.closest('defs')) continue
      const box = ink(node)
      if (box.y >= paper.bottom || box.y + box.height <= paper.top) continue
      if (box.width && box.height && (box.x < paper.left - .75 || box.x + box.width > paper.right + .75 || box.y < paper.top - .75 || box.y + box.height > paper.bottom + .75)) {
        outside.push({ page: index + 1, tag: node.tagName, text: node.textContent, markup: node.outerHTML, box: [box.x - paper.left, box.y - paper.top, box.width, box.height] })
      }
    }
    timings.inkBoundsMs = (timings.inkBoundsMs ?? 0) + performance.now() - started
    started = performance.now()
    const nodes = [...svg.querySelectorAll('text[data-m3n-role="lyric"],text[data-m3n-role="lyric-prefix"],g.note text')]
      .filter(node => node.textContent.trim() && (node.closest('g.note') === null || /^[0-7]$/.test(node.textContent)))
    const boxes = nodes.map(node => ink(node))
    for (const [i, j] of inkOverlapPairs(boxes, .5, timings)) {
      overlaps.push({ page: index + 1, a: nodes[i].textContent, b: nodes[j].textContent })
    }
    timings.collisionsMs = (timings.collisionsMs ?? 0) + performance.now() - started
    timings.collisionNodes = (timings.collisionNodes ?? 0) + nodes.length
    timings.possiblePairs = (timings.possiblePairs ?? 0) + nodes.length * (nodes.length - 1) / 2
  }
  return { outside, overlaps }
}
