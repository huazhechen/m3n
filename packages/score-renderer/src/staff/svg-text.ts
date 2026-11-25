import { scoreLayoutConfig } from '@m3n/numbered-notation'
const ns = 'http://www.w3.org/2000/svg'

/** Flatten text to the same measured character positions for screen and PDF. */
export function resolveStaffText(svg: SVGSVGElement, measureNumbers = false) {
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:${scoreLayoutConfig.rendering.offscreenPosition}px;top:0;pointer-events:none;`
  host.setAttribute('aria-hidden', 'true')
  document.body.append(host); host.append(svg)
  try {
    for (const system of svg.querySelectorAll('g.system')) {
      const measures = [...system.querySelectorAll('g.measure')]
      const last = measures.at(-1)
      // Overlay geometry is finalized in arrangeStaffSystem.
      for (const number of system.querySelectorAll('g.mNum'))
        if (!measureNumbers || number.closest('g.measure') !== last) number.remove()
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
        const glyph = document.createElementNS(ns, 'text')
        glyph.textContent = char
        for (const [name, value] of Object.entries({ x: position.x, y: position.y, 'font-size': size, 'font-family': style.fontFamily, 'font-weight': style.fontWeight, 'font-style': style.fontStyle, 'text-anchor': 'start' })) glyph.setAttribute(name, String(value))
        group.append(glyph)
      }
      text.replaceWith(group)
    }
    for (const number of svg.querySelectorAll('g.mNum')) {
      const transforms: string[] = []
      for (let parent: Element | null = number.parentElement; parent && parent !== svg; parent = parent.parentElement)
        if (parent.hasAttribute('transform')) transforms.unshift(parent.getAttribute('transform')!)
      const overlay = document.createElementNS(ns, 'g')
      overlay.setAttribute('transform', transforms.join(' '))
      overlay.append(number)
      svg.append(overlay)
    }
  } finally { svg.remove(); host.remove() }
}
