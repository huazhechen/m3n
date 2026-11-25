import { scoreLayoutConfig } from '@m3n/numbered-notation'
import fontkit from '@pdf-lib/fontkit'
import { loadScoreFont, prepareNumberedNotationFonts, scoreCjkFont, scoreFontForCharacter, type ScoreFontResource } from '@m3n/numbered-notation'

/** One font policy for screen measurement, vector PDF and standalone PNG paths. */
export async function prepareScoreTextFonts(pages: readonly SVGSVGElement[], suppliedTextFont?: Uint8Array) {
  const text = pages.map(page => [...page.querySelectorAll('text')].map(node => node.textContent).join('')).join('') + 'https://score.cheesefans.com/'
  await prepareNumberedNotationFonts(text)
  const cjk = scoreCjkFont(text)
  const parsed = new Map<string, ReturnType<typeof fontkit.create>>()
  const bytes = new Map<string, Uint8Array>()
  const resources = new Map<string, ScoreFontResource>()
  const resource = (char: string, weight: number = scoreLayoutConfig.fonts.regularWeight, italic = false, numbers = false, family = '') => {
    const font = scoreFontForCharacter(char, cjk, weight, italic, numbers, family)
    resources.set(font.file, font)
    return font
  }
  for (const page of pages) for (const node of page.querySelectorAll('text')) {
    const weight = Number(node.getAttribute('font-weight') ?? scoreLayoutConfig.fonts.regularWeight)
    const italic = node.getAttribute('font-style') === 'italic'
    const numbers = node.getAttribute('font-family') === scoreLayoutConfig.fonts.numbers
    for (const char of node.textContent ?? '') if (!/\s|[\u200B\u2800]/u.test(char)) resource(char, weight, italic, numbers, node.getAttribute('font-family') ?? '')
  }
  for (const char of 'https://score.cheesefans.com/') resource(char)
  await Promise.all([...resources.values()].map(async font => {
    const data = font.file === cjk.file && suppliedTextFont ? suppliedTextFont : await loadScoreFont(font)
    const parsedFont = fontkit.create(data)
    // An explicitly supplied publishing subset must cover the selected score.
    if (font.file === cjk.file) for (const char of text) {
      if (/\s|[\u200B\u2800]/u.test(char)) continue
      if (scoreFontForCharacter(char, cjk).file === cjk.file && !parsedFont.hasGlyphForCodePoint(char.codePointAt(0)!)) throw new Error(`文字字体子集缺少字符：${char}`)
    }
    parsed.set(font.file, parsedFont); bytes.set(font.file, data)
  }))
  return { cjk, resources, parsed, bytes, resource }
}

/** Raster SVG images cannot use the document's FontFaces. Preserve measured
 * character origins and use actual font outlines, without duplicating fonts. */
export async function outlineScoreText(svg: SVGSVGElement) {
  const fonts = await prepareScoreTextFonts([svg])
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:${scoreLayoutConfig.rendering.offscreenPosition}px;top:0;pointer-events:none`
  host.setAttribute('aria-hidden', 'true')
  document.body.append(host); host.append(svg)
  const ns = 'http://www.w3.org/2000/svg'
  try {
    for (const text of svg.querySelectorAll('text')) {
      const style = getComputedStyle(text), size = Number.parseFloat(style.fontSize)
      const weight = Number.parseInt(style.fontWeight), italic = style.fontStyle === 'italic'
      const numbers = style.fontFamily.includes(scoreLayoutConfig.fonts.numbers)
      const group = document.createElementNS(ns, 'g')
      for (const attr of text.attributes) if (['transform', 'opacity', 'class', 'id'].includes(attr.name) || attr.name.startsWith('data-')) group.setAttribute(attr.name, attr.value)
      let offset = 0
      for (const char of text.textContent ?? '') {
        const position = text.getStartPositionOfChar(offset), rotation = text.getRotationOfChar(offset)
        offset += char.length
        if (/\s|[\u200B\u2800]/u.test(char)) continue
        const font = fonts.resource(char, weight, italic, numbers, style.fontFamily)
        const parsed = fonts.parsed.get(font.file)!
        const glyph = parsed.glyphForCodePoint(char.codePointAt(0)!)
        const path = document.createElementNS(ns, 'path')
        path.setAttribute('d', glyph.path.toSVG())
        path.setAttribute('fill', style.fill)
        path.setAttribute('transform', `translate(${position.x} ${position.y}) rotate(${rotation}) scale(${size / parsed.unitsPerEm} ${-size / parsed.unitsPerEm})`)
        if (font.file === fonts.cjk.file && weight >= 600) {
          path.setAttribute('stroke', style.fill); path.setAttribute('stroke-width', String(parsed.unitsPerEm * .015))
        }
        group.append(path)
      }
      text.replaceWith(group)
    }
  } finally { svg.remove(); host.remove() }
}
