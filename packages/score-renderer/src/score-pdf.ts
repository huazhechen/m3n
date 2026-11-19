import fontkit from '@pdf-lib/fontkit'
import {
  PDFDocument, PDFName, PDFString, StandardFonts, LineCapStyle, LineJoinStyle,
  beginText, endText, setFontAndSize, setTextMatrix, showText, setTextRenderingMode,
  pushGraphicsState, popGraphicsState, concatTransformationMatrix, scale,
  setFillingRgbColor, setStrokingRgbColor, setLineWidth, setLineJoin,
  TextRenderingMode, rgb,
} from 'pdf-lib'
import { a4ImagePlacement, type ScorePdfOptions } from './score-export.js'
import { registerSystemCjkFont } from './pdf-system-font.js'

const ns = 'http://www.w3.org/2000/svg'

/** Converts only the native engine's primitives; never rasterizes a score. */
export async function vectorScorePdf(pages: readonly SVGSVGElement[], onProgress?: (done: number, total: number) => void, options: ScorePdfOptions = {}) {
  options.signal?.throwIfAborted()
  options.onPhase?.('fonts')
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const embedded = pages.flatMap(svg => [...svg.querySelectorAll('style')]).find(style => style.textContent?.includes('data:font/ttf;base64,'))?.textContent?.match(/data:font\/ttf;base64,([A-Za-z0-9+/=]+)/)?.[1]
  if (!embedded) throw new Error('乐谱缺少音乐数字字体，无法导出 PDF。')
  const music = await pdf.embedFont(Uint8Array.from(atob(embedded), c => c.charCodeAt(0)), { subset: true, customName: 'MUSICF+BarlowSemiCondensed-Medium' })
  const musicCharacters = new Set(music.getCharacterSet())
  const latin = await Promise.all([StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic].map(name => pdf.embedFont(name)))
  const system = registerSystemCjkFont(pdf, pages.flatMap(svg => [...svg.querySelectorAll('text')].flatMap(text => [...(text.textContent ?? '')])))
  // Repeated notes and lyrics share their encoded glyphs; avoid shaping and
  // throwing WinAnsi encoding errors for every occurrence of a Chinese character.
  const encodedCharacters = new Map<string, { name: PDFName; encoded: ReturnType<typeof system.encode> }>()
  options.onPhase?.('pages')
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none;'
  host.setAttribute('aria-hidden', 'true')
  document.body.append(host)
  const pt = 72 / 25.4
  try {
    for (const [index, original] of pages.entries()) {
      options.signal?.throwIfAborted()
      const svg = original.cloneNode(true) as SVGSVGElement
      const { width, height } = svg.viewBox.baseVal
      if (!(width > 0 && height > 0)) throw new Error('简谱尺寸无效。')
      svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height))
      svg.style.cssText = `width:${width}px;height:${height}px;`
      host.replaceChildren(svg)
      const rootMatrix = svg.getScreenCTM()
      if (!rootMatrix) throw new Error('无法测量乐谱坐标。')
      const inverse = rootMatrix.inverse()
      const placement = options.fullPage ? { x: 0, y: 0, width: 210, height: 297 } : a4ImagePlacement(width, height)
      const factor = placement.width * pt / width
      const page = pdf.addPage([210 * pt, 297 * pt])
      const musicName = PDFName.of('M3NMusic')
      page.node.setFontDictionary(musicName, music.ref)
      page.node.setFontDictionary(system.name, system.ref)
      const latinNames = latin.map((font, i) => {
        const name = PDFName.of(`M3NLatin${i}`)
        page.node.setFontDictionary(name, font.ref)
        return name
      })
      let elementCount = 0
      for (const element of svg.querySelectorAll<SVGGraphicsElement>('*')) {
        if (++elementCount % 128 === 0) {
          await new Promise<void>(resolve => setTimeout(resolve, 0))
          options.signal?.throwIfAborted()
        }
        if (element.namespaceURI !== ns || element.closest('defs')) continue
        const tag = element.localName
        if (['svg', 'g', 'a', 'title', 'desc', 'tspan'].includes(tag)) continue
        if (!['path', 'line', 'rect', 'circle', 'text'].includes(tag)) throw new Error(`不支持的乐谱图形：${tag}`)
        const style = getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        const matrix = element.getScreenCTM()
        if (!matrix) throw new Error('无法测量乐谱图形坐标。')
        const m = inverse.multiply(matrix)
        page.pushOperators(pushGraphicsState(), concatTransformationMatrix(
          factor * m.a, -factor * m.b, factor * m.c, -factor * m.d,
          placement.x * pt + factor * m.e, (297 - placement.y) * pt - factor * m.f,
        ))
        if (tag === 'text') {
          const text = element as SVGTextElement
          const fontSize = Number.parseFloat(style.fontSize)
          const isMusic = style.fontFamily.includes('M3N Numbers')
          const bold = Number.parseInt(style.fontWeight, 10) >= 600
          const italic = style.fontStyle === 'italic'
          const latinIndex = (bold ? 1 : 0) + (italic ? 2 : 0)
          page.pushOperators(setFillingRgbColor(0, 0, 0), setStrokingRgbColor(0, 0, 0), beginText())
          let offset = 0
          for (const char of text.textContent ?? '') {
            const position = text.getStartPositionOfChar(offset)
            const rotation = text.getRotationOfChar(offset) * Math.PI / 180
            offset += char.length
            if (/\s|[\u200B\u2800]/u.test(char)) continue
            const cacheKey = `${isMusic ? 'music' : latinIndex}:${char}`
            let resolved = encodedCharacters.get(cacheKey)
            if (!resolved) {
              let name = system.name, encoded = system.encode(char)
              if (isMusic) {
                if (!musicCharacters.has(char.codePointAt(0)!)) throw new Error(`音乐字体缺少字符：${char}`)
                name = musicName; encoded = music.encodeText(char)
              } else {
                try { encoded = latin[latinIndex]!.encodeText(char); name = latinNames[latinIndex]! } catch { /* The PDF viewer supplies CJK glyphs. */ }
              }
              resolved = { name, encoded }; encodedCharacters.set(cacheKey, resolved)
            }
            const { name, encoded } = resolved
            const syntheticBold = bold && name === system.name
            page.pushOperators(setFontAndSize(name, fontSize),
              setTextRenderingMode(syntheticBold ? TextRenderingMode.FillAndOutline : TextRenderingMode.Fill),
              setLineWidth(fontSize * 0.015),
              setTextMatrix(Math.cos(rotation), Math.sin(rotation), Math.sin(rotation), -Math.cos(rotation), position.x, position.y),
              showText(encoded))
          }
          page.pushOperators(endText())
        } else {
          const num = (name: string) => Number.parseFloat(element.getAttribute(name) ?? '0')
          const shade = style.fill === 'rgb(255, 255, 255)' ? 1 : 0
          const color = style.fill === 'none' ? undefined : rgb(shade, shade, shade)
          const borderColor = style.stroke === 'none' ? undefined : rgb(0, 0, 0)
          const borderWidth = borderColor ? Number.parseFloat(style.strokeWidth) : 0
          const options = { color, borderColor, borderWidth, borderLineCap: style.strokeLinecap === 'round' ? LineCapStyle.Round : LineCapStyle.Butt }
          page.pushOperators(setLineJoin(style.strokeLinejoin === 'round' ? LineJoinStyle.Round : LineJoinStyle.Miter))
          if (tag === 'path') {
            // drawSvgPath already flips Y; cancel that flip in SVG coordinates.
            page.pushOperators(scale(1, -1))
            page.drawSvgPath(element.getAttribute('d') ?? '', { ...options, x: 0, y: 0 })
          } else if (tag === 'line') {
            page.drawLine({ start: { x: num('x1'), y: num('y1') }, end: { x: num('x2'), y: num('y2') }, color: borderColor, thickness: borderWidth, lineCap: options.borderLineCap })
          } else if (tag === 'rect') {
            const rect = element as SVGRectElement
            page.drawRectangle({ ...options, x: rect.x.baseVal.value, y: rect.y.baseVal.value, width: rect.width.baseVal.value, height: rect.height.baseVal.value })
          } else {
            page.drawCircle({ ...options, x: num('cx'), y: num('cy'), size: num('r') })
          }
        }
        page.pushOperators(popGraphicsState())
      }
      for (const link of svg.querySelectorAll<SVGAElement>('a')) {
        const href = link.getAttribute('href') ?? link.getAttribute('xlink:href')
        if (!href || !/^https?:\/\//i.test(href)) continue
        const bounds = link.getBoundingClientRect()
        const topLeft = new DOMPoint(bounds.left, bounds.top).matrixTransform(inverse)
        const bottomRight = new DOMPoint(bounds.right, bounds.bottom).matrixTransform(inverse)
        page.node.addAnnot(pdf.context.register(pdf.context.obj({
          Type: 'Annot', Subtype: 'Link', Border: [0, 0, 0],
          Rect: [placement.x * pt + topLeft.x * factor, (297 - placement.y) * pt - bottomRight.y * factor,
            placement.x * pt + bottomRight.x * factor, (297 - placement.y) * pt - topLeft.y * factor],
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(href) },
        })))
      }
      onProgress?.(index + 1, pages.length)
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    }
    options.signal?.throwIfAborted()
    options.onPhase?.('saving')
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    const bytes = await pdf.save()
    options.signal?.throwIfAborted()
    return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  } finally { host.remove() }
}
