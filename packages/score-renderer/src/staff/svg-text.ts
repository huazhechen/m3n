import { SCORE_TEXT_FONT } from '@m3n/numbered-notation'
import smuflGlyphs from './smufl-glyphs.json'
const ns = 'http://www.w3.org/2000/svg'

/** Resolve nested SVG text into measured characters and portable Bravura paths.
 * This also removes Verovio's indentation from the text consumed by PDF export.
 * Bravura outlines come from the bundled source; see public/licenses/verovio.
 */
export function resolveStaffText(svg: SVGSVGElement, measureNumbers = false) {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none;'
  host.setAttribute('aria-hidden', 'true')
  document.body.append(host); host.append(svg)
  try {
    for (const system of svg.querySelectorAll('g.system')) {
      const measures = [...system.querySelectorAll('g.measure')]
      const last = measures.at(-1)
      for (const number of system.querySelectorAll('g.mNum')) {
        if (!measureNumbers || number.closest('g.measure') !== last) { number.remove(); continue }
        const text = number.querySelector('text')
        const barLines = [...last!.querySelectorAll<SVGGraphicsElement>('g.barLine path')]
        if (!text || !barLines.length) continue
        const inverse = text.getCTM()!.inverse()
        const right = Math.max(...barLines.map(line => {
          const box = line.getBBox()
          return new DOMPoint(box.x + box.width, box.y).matrixTransform(line.getCTM()!).matrixTransform(inverse).x
        }))
        text.setAttribute('x', String(right))
        text.setAttribute('text-anchor', 'end')
      }
    }
    for (const text of svg.querySelectorAll('text')) {
      const characters: Array<{ char: string; element: Element }> = []
      const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT)
      let node: Node | null, pendingSpace: Element | undefined
      while ((node = walker.nextNode())) {
        const element = node.parentElement!
        for (const char of node.textContent ?? '') {
          if (/[ \t\r\n]/.test(char)) { pendingSpace = element; continue }
          if (pendingSpace && characters.length) characters.push({ char: ' ', element: pendingSpace })
          pendingSpace = undefined
          characters.push({ char, element })
        }
      }
      const group = document.createElementNS(ns, 'g')
      for (const attr of text.attributes) if (!['x', 'y', 'font-size'].includes(attr.name)) group.setAttribute(attr.name, attr.value)
      let index = 0
      for (const { char, element } of characters) {
        const position = text.getStartPositionOfChar(index)
        index += char.length
        if (/\s/.test(char)) continue
        const style = getComputedStyle(element), size = Number.parseFloat(style.fontSize)
        const code = char.codePointAt(0)!.toString(16).toUpperCase()
        if (/[\uE000-\uF8FF]/.test(char)) {
          const outline = (smuflGlyphs as Record<string, string>)[code]
          if (!outline) throw new Error(`五线谱文字字形缺失：${code}`)
          const glyph = document.createElementNS(ns, 'g')
          glyph.setAttribute('transform', `translate(${position.x} ${position.y}) scale(${size / 1000})`)
          glyph.innerHTML = outline
          glyph.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'))
          group.append(glyph)
        } else {
          const glyph = document.createElementNS(ns, 'text')
          glyph.textContent = char
          for (const [name, value] of Object.entries({ x: position.x, y: position.y, 'font-size': size, 'font-family': SCORE_TEXT_FONT, 'font-weight': style.fontWeight, 'font-style': style.fontStyle, 'text-anchor': 'start' })) glyph.setAttribute(name, String(value))
          group.append(glyph)
        }
      }
      text.replaceWith(group)
    }
  } finally { svg.remove(); host.remove() }
}
