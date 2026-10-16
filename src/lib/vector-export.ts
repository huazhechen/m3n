import type { Font } from 'opentype.js'
let textFont: Promise<Font> | undefined
const numberFonts = new Map<string, Font>()

async function exportFont() {
  textFont ??= (async () => {
    const { parse } = await import('opentype.js')
    const response = await fetch('/fonts/NotoSerifCJKsc-Regular.otf')
    if (!response.ok) throw new Error('无法加载导出中文字体，请重试。')
    return parse(await response.arrayBuffer())
  })().catch(error => { textFont = undefined; throw error })
  return textFont
}

/** Resolve character geometry while attached, then replace text with portable vector outlines. */
export async function outlineSvgText(svg: SVGSVGElement) {
  const fallback = await exportFont()
  const { parse } = await import('opentype.js')
  const embedded = /data:font\/ttf;base64,([A-Za-z0-9+/=]+)/.exec(svg.querySelector('style')?.textContent ?? '')?.[1]
  let numbers: Font | undefined
  if (embedded) {
    numbers = numberFonts.get(embedded)
    if (!numbers) {
      const bytes = Uint8Array.from(atob(embedded), char => char.charCodeAt(0))
      numbers = parse(bytes.buffer); numberFonts.set(embedded, numbers)
    }
  }
  for (const text of svg.querySelectorAll<SVGTextElement>('text')) {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    for (const attr of text.attributes) if (['transform', 'opacity', 'class', 'id'].includes(attr.name) || attr.name.startsWith('data-')) group.setAttribute(attr.name, attr.value)
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT)
    let node: Node | null, offset = 0
    while ((node = walker.nextNode())) {
      const style = getComputedStyle(node.parentElement ?? text)
      const size = Number.parseFloat(style.fontSize) || 16
      const font = style.fontFamily.includes('M3N Numbers') && numbers ? numbers : fallback
      for (const char of node.textContent ?? '') {
        const index = offset
        offset += char.length
        if (/\s|[\u200B\u2800]/u.test(char)) continue
        if (!font.hasChar(char)) throw new Error(`导出字体不包含字符“${char}”（U+${char.codePointAt(0)!.toString(16).toUpperCase()}）。`)
        if (index >= text.getNumberOfChars()) continue
        const position = text.getStartPositionOfChar(index)
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', font.getPath(char, position.x, position.y, size).toPathData(3))
        path.setAttribute('fill', style.fill || '#000000')
        const rotation = text.getRotationOfChar(index)
        if (rotation) path.setAttribute('transform', `rotate(${rotation} ${position.x} ${position.y})`)
        if (Number.parseInt(style.fontWeight, 10) >= 600) { path.setAttribute('stroke', style.fill); path.setAttribute('stroke-width', String(size * 0.015)) }
        group.append(path)
      }
    }
    group.setAttribute('data-outlined-text', text.textContent ?? '')
    text.replaceWith(group)
  }
}
