/** Combine the unchanged SVG pages, with a width-relative frame around the image. */
export function frameScoreImage(pages: readonly SVGSVGElement[], marginRatio = .06): SVGSVGElement {
  if (!pages.length) throw new Error('当前没有可导出的乐谱。')
  if (!Number.isFinite(marginRatio) || marginRatio < 0) throw new Error('图片外边距比例必须是非负有限数值。')
  const sizes = pages.map(page => ({ width: page.viewBox.baseVal.width, height: page.viewBox.baseVal.height }))
  const width = Math.max(...sizes.map(size => size.width))
  const height = sizes.reduce((sum, size) => sum + size.height, 0)
  const margin = width * marginRatio
  const doc = pages[0]!.ownerDocument, ns = 'http://www.w3.org/2000/svg'
  const root = doc.createElementNS(ns, 'svg')
  root.setAttribute('xmlns', ns)
  root.setAttribute('width', String(width + margin * 2))
  root.setAttribute('height', String(height + margin * 2))
  root.setAttribute('viewBox', `0 0 ${width + margin * 2} ${height + margin * 2}`)
  const background = doc.createElementNS(ns, 'rect')
  background.setAttribute('width', '100%'); background.setAttribute('height', '100%'); background.setAttribute('fill', 'white')
  root.append(background)
  let y = margin
  for (const [index, page] of pages.entries()) {
    const copy = page.cloneNode(true) as SVGSVGElement
    copy.setAttribute('x', String(margin + (width - sizes[index]!.width) / 2))
    copy.setAttribute('y', String(y))
    copy.setAttribute('width', String(sizes[index]!.width))
    copy.setAttribute('height', String(sizes[index]!.height))
    copy.setAttribute('overflow', 'visible')
    root.append(copy)
    y += sizes[index]!.height
  }
  const footer = doc.createElementNS(ns, 'text')
  footer.textContent = 'https://score.cheesefans.com/'
  footer.setAttribute('x', String(width + margin * 2 - margin * .35))
  footer.setAttribute('y', String(height + margin * 1.55))
  footer.setAttribute('text-anchor', 'end')
  footer.setAttribute('font-family', 'Arial, sans-serif')
  footer.setAttribute('font-size', String(Math.max(8, width * .012)))
  footer.setAttribute('fill', '#666')
  root.append(footer)
  return root
}
