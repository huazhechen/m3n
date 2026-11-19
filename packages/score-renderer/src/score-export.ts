import { A4_MARGIN_MM } from '@m3n/notation'

export function downloadBlob(blob: Blob, fileName: string) { 
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function getSvgSize(svg: SVGSVGElement) {
  const bounds = svg.getBoundingClientRect()
  const viewBox = svg.viewBox.baseVal
  const width = viewBox.width || Number.parseFloat(svg.getAttribute('width') ?? '') || bounds.width
  const height = viewBox.height || Number.parseFloat(svg.getAttribute('height') ?? '') || bounds.height
  return { width, height }
}

export function a4SourcePageHeight(sourceWidth: number, margin = A4_MARGIN_MM) {
  const pageWidth = 210 - margin * 2
  const pageHeight = 297 - margin * 2
  return Math.floor(sourceWidth * pageHeight / pageWidth)
}

export function a4ImagePlacement(sourceWidth: number, sourceHeight: number, margin = A4_MARGIN_MM) {
  const contentWidth = 210 - margin * 2
  const contentHeight = 297 - margin * 2
  const scale = Math.min(contentWidth / sourceWidth, contentHeight / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  return {
    x: margin + (contentWidth - width) / 2,
    y: margin,
    width,
    height,
  }
}

export function stackScoreCanvases(canvases: readonly HTMLCanvasElement[]) {
  if (canvases.length === 0) throw new Error('当前没有可导出的简谱。')
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(...canvases.map((page) => page.width))
  canvas.height = canvases.reduce((height, page) => height + page.height, 0)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建图片画布。')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  let y = 0
  for (const page of canvases) {
    context.drawImage(page, 0, y)
    y += page.height
  }
  return canvas
}

export async function renderScoreCanvas(svg: SVGSVGElement, targetWidth: number, pixelRatio = 1) {
  const { width: sourceWidth, height: sourceHeight } = getSvgSize(svg)
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('简谱尺寸无效。')
  }

  const safePixelRatio = Math.max(1, pixelRatio)
  const targetHeight = Math.ceil(targetWidth * sourceHeight / sourceWidth)
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  // Standalone SVG images lose the HTML language used for CJK font fallback.
  const language = svg.closest('[lang]')?.getAttribute('lang') || svg.ownerDocument.documentElement.lang
  if (language) clone.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:lang', language)
  clone.setAttribute('width', String(sourceWidth))
  clone.setAttribute('height', String(sourceHeight))
  clone.setAttribute('viewBox', `0 0 ${sourceWidth} ${sourceHeight}`)
  clone.style.background = '#ffffff'
  clone.style.transform = ''
  clone.style.transformOrigin = ''

  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(targetWidth * safePixelRatio)
    canvas.height = Math.ceil(targetHeight * safePixelRatio)
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('无法创建图片画布。')
    }
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Print native SVG with the device fonts; the browser can save a vector PDF. */
export async function printScorePages(pages: readonly SVGSVGElement[], title: string) {
  if (!pages.length) throw new Error('当前没有可打印的乐谱。')
  const frame = document.createElement('iframe')
  frame.title = '乐谱打印'
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:794px;height:1123px;border:0;'
  const loaded = new Promise<void>(resolve => { frame.onload = () => resolve() })
  frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'
  document.body.append(frame)
  try {
    await loaded
    const target = frame.contentDocument!
    const view = frame.contentWindow!
    target.documentElement.lang = document.documentElement.lang
    target.title = title
    const style = target.createElement('style')
    style.textContent = `
      @page { size: A4 portrait; margin: 0; }
      html, body { margin: 0; padding: 0; background: white; }
      .print-page { position: relative; width: 210mm; height: 297mm; break-after: page; overflow: hidden; }
      .print-page:last-child { break-after: auto; }
      .print-page > svg { position: absolute; display: block; }
    `
    target.head.append(style)
    for (const svg of pages) {
      const section = target.createElement('section')
      section.className = 'print-page'
      const copy = target.importNode(svg, true)
      const size = getSvgSize(svg)
      const placement = a4ImagePlacement(size.width, size.height)
      copy.style.cssText = `left:${placement.x}mm;top:${placement.y}mm;width:${placement.width}mm;height:${placement.height}mm;`
      section.append(copy)
      target.body.append(section)
    }
    target.body.getBoundingClientRect()
    await target.fonts.ready
    await new Promise<void>(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve())))
    view.addEventListener('afterprint', () => frame.remove(), { once: true })
    view.focus()
    view.print()
  } catch (error) {
    frame.remove()
    throw error
  }
}
