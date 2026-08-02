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
export type ScoreExportHeaderItem = {
  value: string
  side: 'left' | 'right' | 'center'
  priority: number
}

/** Adds the editor's header metadata above the engraved score for export. */
export function addScoreHeader(svg: SVGSVGElement, metadata: readonly ScoreExportHeaderItem[]) {
  const items = metadata.filter((item) => item.value.trim())
  if (items.length === 0) return

  const { width, height } = getSvgSize(svg)
  if (width <= 0 || height <= 0) return
  const namespace = 'http://www.w3.org/2000/svg'
  const centered = items.filter((item) => item.side === 'center').sort((left, right) => left.priority - right.priority)
  const left = items.filter((item) => item.side === 'left').sort((left, right) => left.priority - right.priority)
  const right = items.filter((item) => item.side === 'right').sort((left, right) => left.priority - right.priority)
  const headingSize = Math.max(20, width * 0.035)
  const detailSize = Math.max(13, width * 0.022)
  let cursor = detailSize + 10

  const textElement = (value: string, x: number, y: number, anchor: 'start' | 'middle' | 'end', size: number, weight = '400') => {
    const text = document.createElementNS(namespace, 'text')
    text.textContent = value
    text.setAttribute('x', String(x))
    text.setAttribute('y', String(y))
    text.setAttribute('text-anchor', anchor)
    text.setAttribute('font-family', 'sans-serif')
    text.setAttribute('font-size', String(size))
    text.setAttribute('font-weight', weight)
    return text
  }

  const header = document.createElementNS(namespace, 'g')
  for (const item of centered) {
    const title = item.priority === 0
    const size = title ? headingSize : detailSize
    header.append(textElement(item.value, width / 2, cursor, 'middle', size, title ? '600' : '400'))
    cursor += size * 1.35
  }
  if (left.length > 0 || right.length > 0) {
    cursor += detailSize * 0.45
    const detailRows = Math.max(left.length, right.length)
    for (let index = 0; index < detailRows; index += 1) {
      const y = cursor + index * detailSize * 1.35
      const leftItem = left[index]
      const rightItem = right[index]
      if (leftItem) header.append(textElement(leftItem.value, width * 0.04, y, 'start', detailSize))
      if (rightItem) header.append(textElement(rightItem.value, width * 0.96, y, 'end', detailSize))
    }
    cursor += detailRows * detailSize * 1.35
  }
  const headerHeight = cursor + detailSize
  const content = document.createElementNS(namespace, 'g')
  while (svg.firstChild) content.append(svg.firstChild)
  content.setAttribute('transform', `translate(0 ${headerHeight})`)
  svg.append(header, content)
  svg.setAttribute('viewBox', `0 0 ${width} ${height + headerHeight}`)
  svg.setAttribute('height', String(height + headerHeight))
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
