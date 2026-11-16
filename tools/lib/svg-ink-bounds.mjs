/** Browser-only bounds in the owning SVG's coordinates. Text uses painted
 * ascent/descent rather than SVG getBBox's font-wide line box. */
export function createSvgInkMeasurer() {
  const context = document.createElement('canvas').getContext('2d')
  const cache = new WeakMap()
  const selector = 'text,path,line,rect,circle,ellipse,polygon,polyline'
  return function bounds(node) {
    if (!node) return undefined
    if (cache.has(node)) return cache.get(node)
    const pieces = node.matches(selector) ? [node] : [...node.querySelectorAll(selector)]
    const inverse = node.ownerSVGElement.getCTM().inverse()
    const boxes = pieces.flatMap(piece => {
      if (piece.closest('defs')) return []
      const style = getComputedStyle(piece)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return []
      let box
      if (piece.tagName === 'text') {
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
        context.textAlign = 'left'; context.textBaseline = 'alphabetic'
        const metrics = context.measureText(piece.textContent)
        const shift = style.textAnchor === 'middle' ? metrics.width / 2 : style.textAnchor === 'end' ? metrics.width : 0
        box = { x: Number(piece.getAttribute('x')) - shift - metrics.actualBoundingBoxLeft,
          y: Number(piece.getAttribute('y')) - metrics.actualBoundingBoxAscent,
          width: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
          height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent }
      } else box = piece.getBBox()
      const stroke = style.stroke !== 'none' ? parseFloat(style.strokeWidth) / 2 : 0
      if (box.width === 0 && !stroke || box.height === 0 && !stroke) return []
      const matrix = inverse.multiply(piece.getCTM())
      const points = [
        [box.x - stroke, box.y - stroke], [box.x + box.width + stroke, box.y - stroke],
        [box.x - stroke, box.y + box.height + stroke], [box.x + box.width + stroke, box.y + box.height + stroke],
      ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix))
      return [{ left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
        top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) }]
    })
    const x = boxes.length ? Math.min(...boxes.map(b => b.left)) : 0
    const y = boxes.length ? Math.min(...boxes.map(b => b.top)) : 0
    const box = { x, y, width: boxes.length ? Math.max(...boxes.map(b => b.right)) - x : 0,
      height: boxes.length ? Math.max(...boxes.map(b => b.bottom)) - y : 0 }
    cache.set(node, box)
    return box
  }
}
