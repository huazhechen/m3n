// Keep the same font preparation and resolved glyph positions as the outlined edition.
export { prepare } from './scorebook-layout.mjs'

export function compactPage(markup) {
  const host = document.querySelector('#scratch')
  host.innerHTML = markup
  const svg = host.firstElementChild
  // Match outlinePage: drop primitives entirely outside each nested score slice.
  for (const nested of svg.querySelectorAll('svg')) {
    const view = nested.viewBox.baseVal
    for (const node of nested.querySelectorAll('text,path,line,circle,polygon,ellipse')) {
      if (node.closest('defs')) continue
      const box = node.getBBox()
      if (box.y + box.height < view.y || box.y > view.y + view.height) node.remove()
    }
  }
  let glyphs = 0
  for (const text of svg.querySelectorAll('text')) {
    const positions = []
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    for (const attr of text.attributes) {
      if (['transform', 'opacity', 'class', 'id'].includes(attr.name) || attr.name.startsWith('data-')) group.setAttribute(attr.name, attr.value)
    }
    // Resolve addressable characters exactly as outlineSvgText does, including
    // collapsed spaces, tspan font properties, rotation and UTF-16 indexing.
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT)
    const characters = []
    let node, pendingSpace = null
    while ((node = walker.nextNode())) {
      const element = node.parentElement ?? text
      const preserve = /pre|break-spaces/.test(getComputedStyle(element).whiteSpace)
      for (const char of node.textContent ?? '') {
        if (!preserve && /[ \t\r\n]/.test(char)) { pendingSpace = element; continue }
        if (pendingSpace && characters.length) characters.push({ char: ' ', element: pendingSpace })
        pendingSpace = null
        characters.push({ char, element })
      }
    }
    let offset = 0
    for (const { char, element } of characters) {
      const index = offset
      offset += char.length
      if (/\s|[\u200B\u2800]/u.test(char)) continue
      if (index >= text.getNumberOfChars()) throw new Error('Incomplete SVG character positions')
      const style = getComputedStyle(element)
      const size = Number.parseFloat(style.fontSize) || 16
      const position = text.getStartPositionOfChar(index)
      if (![size, position.x, position.y].every(Number.isFinite)) throw new Error('Invalid glyph coordinates')
      const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      glyph.textContent = char
      glyph.setAttribute('x', String(position.x))
      glyph.setAttribute('y', String(position.y))
      glyph.setAttribute('font-size', String(size))
      glyph.setAttribute('font-family', style.fontFamily.includes('M3N Numbers') ? 'M3N Numbers' : 'Scorebook Text')
      glyph.setAttribute('font-weight', '400')
      glyph.setAttribute('text-anchor', 'start')
      glyph.setAttribute('dominant-baseline', 'alphabetic')
      glyph.setAttribute('fill', style.fill || '#000000')
      glyph.style.fontSynthesis = 'none'
      const rotation = text.getRotationOfChar(index)
      if (rotation) glyph.setAttribute('transform', `rotate(${rotation} ${position.x} ${position.y})`)
      // The outlined export adds this same stroke instead of another bold font.
      if (Number.parseInt(style.fontWeight, 10) >= 600) {
        glyph.setAttribute('stroke', style.fill)
        glyph.setAttribute('stroke-width', String(size * 0.015))
      }
      group.append(glyph)
      positions.push({ glyph, position })
      glyphs++
    }
    group.setAttribute('data-embedded-text', text.textContent ?? '')
    text.replaceWith(group)
    for (const { glyph, position } of positions) {
      const actual = glyph.getStartPositionOfChar(0)
      if (Math.abs(actual.x - position.x) > .001 || Math.abs(actual.y - position.y) > .001) throw new Error('A compact glyph moved from its original baseline')
    }
  }
  const outside = []
  const width = svg.viewBox.baseVal.width, height = svg.viewBox.baseVal.height
  for (const node of svg.querySelectorAll('text,path,line,circle')) {
    if (node.closest('defs')) continue
    const box = node.getBoundingClientRect(), paper = svg.getBoundingClientRect()
    if (box.width && box.height && (box.left < paper.left - .5 || box.right > paper.left + width + .5 || box.top < paper.top - .5 || box.bottom > paper.top + height + .5)) outside.push(node.outerHTML.slice(0,160))
  }
  return { markup: svg.outerHTML, glyphs, outside }
}
