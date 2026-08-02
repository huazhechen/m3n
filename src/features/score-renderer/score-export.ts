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

export async function renderHeaderAndScoreCanvas(header: HTMLElement | null, score: HTMLCanvasElement, width: number) {
  if (!header) return score
  const headerWidth = header.getBoundingClientRect().width
  if (headerWidth <= 0) return score
  const copy = header.cloneNode(true) as HTMLElement
  copy.style.position = 'fixed'
  copy.style.top = '0'
  copy.style.left = '-10000px'
  copy.style.width = `${headerWidth}px`
  copy.style.minWidth = `${headerWidth}px`
  document.body.append(copy)
  try {
    const { default: html2canvas } = await import('html2canvas')
    const heading = await html2canvas(copy, { backgroundColor: '#fffef9', logging: false, scale: width / headerWidth })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(width, score.width)
    canvas.height = heading.height + score.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建导出画布。')
    context.fillStyle = '#fffef9'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(heading, 0, 0, canvas.width, heading.height)
    context.drawImage(score, 0, heading.height, canvas.width, score.height)
    return canvas
  } finally {
    copy.remove()
  }
}
