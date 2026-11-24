import { createSvgInkMeasurer } from './svg-ink-bounds.mjs'

/** Inspect painted SVG in a mounted browser DOM, shared by both PDF paths. */
export function inspectScorePages(pages) {
  const outside = [], overlaps = []
  const ink = createSvgInkMeasurer()
  for (const [index, svg] of pages.entries()) {
    const view = svg.viewBox.baseVal
    const paper = { left: view.x, top: view.y, right: view.x + view.width, bottom: view.y + view.height }
    for (const node of svg.querySelectorAll('text,path,line,circle,rect,polygon,ellipse')) {
      if (node.closest('defs')) continue
      const box = ink(node)
      if (box.y >= paper.bottom || box.y + box.height <= paper.top) continue
      if (box.width && box.height && (box.x < paper.left - .75 || box.x + box.width > paper.right + .75 || box.y < paper.top - .75 || box.y + box.height > paper.bottom + .75)) {
        outside.push({ page: index + 1, tag: node.tagName, text: node.textContent, markup: node.outerHTML, box: [box.x - paper.left, box.y - paper.top, box.width, box.height] })
      }
    }
    const nodes = [...svg.querySelectorAll('text[data-m3n-role="lyric"],text[data-m3n-role="lyric-prefix"],g.note text')]
      .filter(node => node.textContent.trim() && (node.closest('g.note') === null || /^[0-7]$/.test(node.textContent)))
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = ink(nodes[i]), b = ink(nodes[j])
        if (Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > .5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > .5) {
          overlaps.push({ page: index + 1, a: nodes[i].textContent, b: nodes[j].textContent })
        }
    }
  }
  return { outside, overlaps }
}
