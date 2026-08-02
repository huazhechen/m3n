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

/** Adds an export-only title above the engraved score without changing the MEI layout. */
export function addScoreTitle(svg: SVGSVGElement, title: string) {
  const text = title.trim()
  if (!text) return

  const { width, height } = getSvgSize(svg)
  if (width <= 0 || height <= 0) return
  const headerHeight = Math.max(48, width * 0.09)
  const namespace = 'http://www.w3.org/2000/svg'
  const content = document.createElementNS(namespace, 'g')
  while (svg.firstChild) content.append(svg.firstChild)
  content.setAttribute('transform', `translate(0 ${headerHeight})`)

  const heading = document.createElementNS(namespace, 'text')
  heading.textContent = text
  heading.setAttribute('x', String(width / 2))
  heading.setAttribute('y', String(headerHeight * 0.64))
  heading.setAttribute('text-anchor', 'middle')
  heading.setAttribute('font-family', 'sans-serif')
  heading.setAttribute('font-size', String(Math.max(20, headerHeight * 0.5)))
  heading.setAttribute('font-weight', '600')

  svg.append(heading, content)
  svg.setAttribute('viewBox', `0 0 ${width} ${height + headerHeight}`)
  svg.removeAttribute('height')
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
