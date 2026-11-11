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

export function a4SourcePageHeight(sourceWidth: number, margin = 10) {
  const pageWidth = 210 - margin * 2
  const pageHeight = 297 - margin * 2
  return Math.floor(sourceWidth * pageHeight / pageWidth)
}

export function a4ImagePlacement(sourceWidth: number, sourceHeight: number, margin = 10) {
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
  if (canvases.length === 0) throw new Error('当前没有可导出的五线谱。')
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
    throw new Error('五线谱尺寸无效。')
  }

  const safePixelRatio = Math.max(1, pixelRatio)
  const targetHeight = Math.ceil(targetWidth * sourceHeight / sourceWidth)
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
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
