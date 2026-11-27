import { scoreLayoutConfig } from '@m3n/numbered-notation'
import fontkit from '@pdf-lib/fontkit'
import {
  PDFDocument, PDFName, PDFString, LineCapStyle, LineJoinStyle,
  beginText, endText, setFontAndSize, setTextMatrix, showText, setTextRenderingMode,
  pushGraphicsState, popGraphicsState, concatTransformationMatrix, scale,
  setFillingRgbColor, setStrokingRgbColor, setLineWidth, setLineJoin,
  TextRenderingMode, rgb,
  drawSvgPath,
} from 'pdf-lib'
import { a4ImagePlacement, type ScorePdfOptions } from './score-export.js'
import { prepareScoreTextFonts } from './score-fonts.js'
import { scoreExportFooter } from './score-export-footer.js'

const ns = 'http://www.w3.org/2000/svg'
// Keep rendering interruptible without accumulating nested timer delays.
const pause = () => globalThis.scheduler?.postTask?.(() => {}) ?? new Promise<void>(resolve => setTimeout(resolve, 0))

/** Converts only the native engine's primitives; never rasterizes a score. */
export async function vectorScorePdf(pages: readonly SVGSVGElement[], onProgress?: (done: number, total: number) => void, options: ScorePdfOptions = {}) {
  options.signal?.throwIfAborted()
  options.onPhase?.('fonts')
  await pause()
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const fonts = await prepareScoreTextFonts(pages, options.textFont)
  const embedded = new Map<string, { name: PDFName; font: Awaited<ReturnType<typeof pdf.embedFont>> }>()
  for (const [file, bytes] of fonts.bytes) {
    const parsed = fonts.parsed.get(file)!
    const font = await pdf.embedFont(bytes, { subset: true, customName: `MNN${String.fromCharCode(65 + embedded.size)}AA+${parsed.postscriptName ?? 'ScoreFont'}` })
    embedded.set(file, { name: PDFName.of(`M3NFont${embedded.size}`), font })
  }
  const footerFont = embedded.get(fonts.resource('h').file)!.font
  // Operators are immutable values. Share repeated glyph/style commands while
  // preserving their complete original order in each page's content stream.
  const characters = new Map<string, ReturnType<typeof showText>>()
  const resources = new Map<string, ReturnType<typeof fonts.resource>>()
  const textStyles = new Map<string, ReturnType<typeof setFontAndSize>[]>()
  const paths = new Map<string, ReturnType<typeof drawSvgPath>>()
  const save = pushGraphicsState(), restore = popGraphicsState()
  const blackFill = setFillingRgbColor(0, 0, 0), blackStroke = setStrokingRgbColor(0, 0, 0)
  const textBegin = beginText(), textEnd = endText()
  const originText = setTextMatrix(1, 0, 0, -1, 0, 0), pathFlip = scale(1, -1)
  const roundJoin = setLineJoin(LineJoinStyle.Round), miterJoin = setLineJoin(LineJoinStyle.Miter)
  options.signal?.throwIfAborted()
  options.onPhase?.('pages')
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:${scoreLayoutConfig.rendering.offscreenPosition}px;top:0;pointer-events:none;contain:layout style;`
  host.setAttribute('aria-hidden', 'true')
  document.body.append(host)
  const pt = 72 / 25.4
  try {
    for (const [index, original] of pages.entries()) {
      options.signal?.throwIfAborted()
      const svg = options.consumePages ? original : original.cloneNode(true) as SVGSVGElement
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
      for (const { name, font } of embedded.values()) page.node.setFontDictionary(name, font.ref)
      let elementCount = 0
      const matrices = new WeakMap<SVGGraphicsElement, DOMMatrix>()
      const transforms = new WeakMap<DOMMatrix, ReturnType<typeof concatTransformationMatrix>>()
      const screenMatrix = (element: SVGGraphicsElement, style?: CSSStyleDeclaration): DOMMatrix | null => {
        const saved = matrices.get(element)
        if (saved) return saved
        style ??= getComputedStyle(element)
        // An SVG viewport contributes its viewBox even without a transform.
        // Other inert ancestors share exactly the same browser matrix.
        const parent = element.parentElement
        const measured = element.localName !== 'svg' && !element.hasAttribute('transform') && style.transform === 'none'
          && parent instanceof SVGGraphicsElement ? screenMatrix(parent) : element.getScreenCTM()
        if (measured) matrices.set(element, measured)
        return measured
      }
      for (const element of svg.querySelectorAll<SVGGraphicsElement>('*')) {
        if (++elementCount % 128 === 0) {
          await pause()
          options.signal?.throwIfAborted()
        }
        if (element.namespaceURI !== ns || element.closest('defs')) continue
        const tag = element.localName
        if (['svg', 'g', 'a', 'title', 'desc', 'tspan', 'style'].includes(tag)) continue
        if (!['path', 'line', 'rect', 'circle', 'text'].includes(tag)) throw new Error(`不支持的乐谱图形：${tag}`)
        const style = getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        // Untransformed siblings share their parent's viewport matrix. Cache
        // the browser result, preserving its exact rounding and CSS semantics.
        const matrix = screenMatrix(element, style)
        if (!matrix) throw new Error('无法测量乐谱图形坐标。')
        let transform = transforms.get(matrix)
        if (!transform) {
          const m = inverse.multiply(matrix)
          transform = concatTransformationMatrix(
          factor * m.a, -factor * m.b, factor * m.c, -factor * m.d,
          placement.x * pt + factor * m.e, (297 - placement.y) * pt - factor * m.f,
          )
          transforms.set(matrix, transform)
        }
        page.pushOperators(save, transform)
        if (tag === 'text') {
          const text = element as SVGTextElement
          const fontSize = Number.parseFloat(style.fontSize)
          const fontFamily = style.fontFamily
          const isMusic = fontFamily.includes(scoreLayoutConfig.fonts.latin)
          const weight = Number.parseInt(style.fontWeight, 10)
          const bold = weight >= 600
          const italic = style.fontStyle === 'italic'
          page.pushOperators(blackFill, blackStroke, style.strokeLinejoin === 'round' ? roundJoin : miterJoin, textBegin)
          // Resolved engine glyphs have one character at the local baseline
          // origin. Their enclosing group supplies the complete placement.
          const originGlyph = [...text.textContent ?? ''].length === 1
            && (text.hasAttribute('data-m3n-glyph') || text.parentElement?.hasAttribute('data-m3n-glyph'))
            && text.getAttribute('x') === '0' && text.getAttribute('y') === '0'
            && !['dx', 'dy', 'rotate', 'textLength'].some(name => text.hasAttribute(name))
            && style.textAnchor === 'start' && ['auto', 'alphabetic'].includes(style.dominantBaseline)
          let offset = 0
          for (const char of text.textContent ?? '') {
            const position = originGlyph ? { x: 0, y: 0 } : text.getStartPositionOfChar(offset)
            const rotation = originGlyph ? 0 : text.getRotationOfChar(offset) * Math.PI / 180
            offset += char.length
            if (/\s|[\u200B\u2800]/u.test(char)) continue
            const resourceKey = `${fontFamily}:${weight}:${italic}:${char}`
            let resource = resources.get(resourceKey)
            if (!resource) {
              resource = fonts.resource(char, weight, italic, isMusic, fontFamily)
              if (resources.size >= 8192) resources.clear()
              resources.set(resourceKey, resource)
            }
            const { name, font } = embedded.get(resource.file)!
            const cacheKey = `${resource.file}:${char}`
            let character = characters.get(cacheKey)
            if (!character) {
              character = showText(font.encodeText(char))
              characters.set(cacheKey, character)
            }
            const outlineWidth = style.stroke !== 'none' && Number.parseFloat(style.strokeWidth) > 0
              ? Number.parseFloat(style.strokeWidth) : bold && resource.file === fonts.cjk.file ? fontSize * .015 : 0
            const styleKey = `${resource.file}:${fontSize}:${outlineWidth}`
            let operators = textStyles.get(styleKey)
            if (!operators) {
              operators = [setFontAndSize(name, fontSize),
                setTextRenderingMode(outlineWidth > 0 ? TextRenderingMode.FillAndOutline : TextRenderingMode.Fill), setLineWidth(outlineWidth)]
              if (textStyles.size >= 512) textStyles.clear()
              textStyles.set(styleKey, operators)
            }
            page.pushOperators(...operators,
              rotation === 0 && position.x === 0 && position.y === 0 ? originText
                : setTextMatrix(Math.cos(rotation), Math.sin(rotation), Math.sin(rotation), -Math.cos(rotation), position.x, position.y), character)
          }
          page.pushOperators(textEnd)
        } else {
          const num = (name: string) => Number.parseFloat(element.getAttribute(name) ?? '0')
          const shade = style.fill === 'rgb(255, 255, 255)' ? 1 : 0
          const color = style.fill === 'none' ? undefined : rgb(shade, shade, shade)
          const borderColor = style.stroke === 'none' ? undefined : rgb(0, 0, 0)
          const borderWidth = borderColor ? Number.parseFloat(style.strokeWidth) : 0
          const options = { color, borderColor, borderWidth, borderLineCap: style.strokeLinecap === 'round' ? LineCapStyle.Round : LineCapStyle.Butt }
          page.pushOperators(style.strokeLinejoin === 'round' ? roundJoin : miterJoin)
          if (tag === 'path') {
            // drawSvgPath already flips Y; cancel that flip in SVG coordinates.
            page.pushOperators(pathFlip)
            const d = element.getAttribute('d') ?? ''
            const key = `${shade}:${Boolean(color)}:${Boolean(borderColor)}:${borderWidth}:${options.borderLineCap}:${d}`
            let operators = paths.get(key)
            if (!operators) {
              operators = drawSvgPath(d, { ...options, x: 0, y: 0, scale: undefined })
              paths.set(key, operators)
            }
            page.pushOperators(...operators)
          } else if (tag === 'line') {
            page.drawLine({ start: { x: num('x1'), y: num('y1') }, end: { x: num('x2'), y: num('y2') }, color: borderColor, thickness: borderWidth, lineCap: options.borderLineCap })
          } else if (tag === 'rect') {
            const rect = element as SVGRectElement
            page.drawRectangle({ ...options, x: rect.x.baseVal.value, y: rect.y.baseVal.value, width: rect.width.baseVal.value, height: rect.height.baseVal.value })
          } else {
            page.drawCircle({ ...options, x: num('cx'), y: num('cy'), size: num('r') })
          }
        }
        page.pushOperators(restore)
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
      if (svg.getAttribute('data-score-export-footer') !== 'none') {
        const { text: footer, href: footerHref } = scoreExportFooter(options.scoreUrl)
        const footerSize = 10
        const footerRight = options.fullPage ? 210 - 12 : placement.x + placement.width
        page.drawText(footer, { x: footerRight * pt - footerFont.widthOfTextAtSize(footer, footerSize), y: 6 * pt, size: footerSize, font: footerFont, color: rgb(.4, .4, .4) })
        page.node.addAnnot(pdf.context.register(pdf.context.obj({
          Type: 'Annot', Subtype: 'Link', Border: [0, 0, 0],
          Rect: [footerRight * pt - footerFont.widthOfTextAtSize(footer, footerSize), 6 * pt,
            footerRight * pt, 6 * pt + footerSize],
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(footerHref) },
        })))
      }
      onProgress?.(index + 1, pages.length)
      await pause()
    }
    options.signal?.throwIfAborted()
    options.onPhase?.('saving')
    await pause()
    const bytes = await pdf.save()
    options.signal?.throwIfAborted()
    return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  } finally { host.remove() }
}
