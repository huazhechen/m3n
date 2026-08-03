export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export function getSvgSize(svg: SVGSVGElement, scale = 1) {
  const bounds = svg.getBoundingClientRect()
  const viewBox = svg.viewBox.baseVal
  const transformScale = Math.max(scale, 1)
  const width = viewBox.width || Number.parseFloat(svg.getAttribute('width') ?? '') / transformScale || bounds.width
  const height = viewBox.height || Number.parseFloat(svg.getAttribute('height') ?? '') / transformScale || bounds.height
  return { width, height }
}

export function makeSvgResponsive(svg: SVGSVGElement, scale = 1) {
  const { width, height } = getSvgSize(svg, scale)
  if (width <= 0 || height <= 0) {
    return
  }
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('preserveAspectRatio', 'xMinYMin meet')
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.style.transform = ''
  svg.style.transformOrigin = ''
}

export function a4SourcePageHeight(sourceWidth: number, margin = 10) {
  const pageWidth = 210 - margin * 2
  const pageHeight = 297 - margin * 2
  return Math.floor(sourceWidth * pageHeight / pageWidth)
}

export async function renderScoreCanvas(svg: SVGSVGElement, targetWidth: number, scale = 1) {
  const { width: sourceWidth, height: sourceHeight } = getSvgSize(svg, scale)
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('五线谱尺寸无效。')
  }

  const targetHeight = Math.ceil(targetWidth * sourceHeight / sourceWidth)
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(sourceWidth))
  clone.setAttribute('height', String(sourceHeight))
  clone.setAttribute('viewBox', `0 0 ${sourceWidth} ${sourceHeight}`)
  clone.style.background = '#fffef9'
  clone.style.transform = ''
  clone.style.transformOrigin = ''

  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('无法创建图片画布。')
    }
    context.fillStyle = '#fffef9'
    context.fillRect(0, 0, targetWidth, targetHeight)
    context.drawImage(image, 0, 0, targetWidth, targetHeight)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}
