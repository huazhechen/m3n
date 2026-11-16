/** Browser-only, independent paint test. Rectangle intersection selects candidates;
 * opaque raster overlap confirms a collision, so a curve's empty box is harmless.
 */
export function auditNativeInkCollisions(system) {
  const measure = document.createElement('canvas').getContext('2d')
  const primitiveSelector = 'text,path,line,rect,circle,ellipse'
  const rootInverse = system.ownerSVGElement.getCTM().inverse()
  const primitives = new Map()
  for (const node of system.querySelectorAll(primitiveSelector)) {
    const style = getComputedStyle(node), matrix = rootInverse.multiply(node.getCTM())
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const anchor = node.getAttribute('text-anchor'), align = anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left'
    const number = name => Number(node.getAttribute(name) ?? 0)
    let box
    if (node.tagName === 'text') {
      measure.font = font; measure.textAlign = 'left'; measure.textBaseline = 'alphabetic'
      const m = measure.measureText(node.textContent)
      const x = number('x') - (align === 'center' ? m.width / 2 : align === 'right' ? m.width : 0)
      box = { x: x - m.actualBoundingBoxLeft, y: number('y') - m.actualBoundingBoxAscent, width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent }
    } else box = node.getBBox()
    const stroke = style.stroke !== 'none' ? parseFloat(style.strokeWidth) : 0
    const a = new DOMPoint(box.x - stroke / 2, box.y - stroke / 2).matrixTransform(matrix)
    const b = new DOMPoint(box.x + box.width + stroke / 2, box.y + box.height + stroke / 2).matrixTransform(matrix)
    const path = new Path2D(), tag = node.tagName
    if (tag === 'path') path.addPath(new Path2D(node.getAttribute('d')))
    if (tag === 'rect') path.rect(number('x'), number('y'), number('width'), number('height'))
    if (tag === 'line') { path.moveTo(number('x1'), number('y1')); path.lineTo(number('x2'), number('y2')) }
    if (tag === 'circle') path.arc(number('cx'), number('cy'), number('r'), 0, Math.PI * 2)
    if (tag === 'ellipse') path.ellipse(number('cx'), number('cy'), number('rx'), number('ry'), 0, 0, Math.PI * 2)
    primitives.set(node, { node, path, matrix, font, align, stroke, fill: style.fill !== 'none' && tag !== 'line', cap: style.strokeLinecap, join: style.strokeLinejoin, dash: style.strokeDasharray === 'none' ? [] : style.strokeDasharray.split(/[ ,]+/).map(v => parseFloat(v)), dashOffset: parseFloat(style.strokeDashoffset),
      left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) })
  }
  const objects = []
  const object = (node, kind, label, filter = () => true) => {
    const nodes = node.matches(primitiveSelector) ? [node] : [...node.querySelectorAll(primitiveSelector)].filter(filter)
    const pieces = nodes.map(n => primitives.get(n)).filter(Boolean)
    if (!pieces.length) return
    objects.push({ kind, label, id: node.getAttribute('data-m3n-id') ?? node.id, lane: node.closest('[data-m3n-lane]')?.getAttribute('data-m3n-lane'), pieces,
      left: Math.min(...pieces.map(p => p.left)), right: Math.max(...pieces.map(p => p.right)), top: Math.min(...pieces.map(p => p.top)), bottom: Math.max(...pieces.map(p => p.bottom)) })
  }
  for (const node of system.querySelectorAll('g.note')) object(node, 'music', '', n => !n.closest('[data-m3n-role="mark"]'))
  for (const node of system.querySelectorAll('[data-m3n-role="bar"]')) object(node, 'bar', '')
  for (const node of system.querySelectorAll('[data-m3n-role="beam"]')) object(node, 'music', 'beam')
  for (const node of system.querySelectorAll('[data-m3n-role="control"]')) object(node, node.getAttribute('data-m3n-control') === 'passes' ? 'label' : 'control', node.getAttribute('data-m3n-control'))
  for (const node of system.querySelectorAll('[data-m3n-relation]')) {
    if (!node.parentElement.closest('[data-m3n-relation]')) object(node, 'relation', node.getAttribute('data-m3n-relation'))
  }
  for (const node of system.querySelectorAll('[data-m3n-role="mark"]')) {
    const name = node.getAttribute('data-m3n-mark')
    object(node, ['tip', 'brk', 'hold', 'str'].includes(name) ? 'music' : 'label', name)
  }
  const labels = new Set()
  for (const node of system.querySelectorAll('[data-m3n-role="annotation"],[data-m3n-role="lyric"],[data-m3n-role="lyric-prefix"],[data-m3n-role="navigation"],[data-m3n-role="repeat-count"],[data-m3n-role="alternative-passes"]')) {
    // Inline pass text is already represented by its complete control group.
    if (node.closest('[data-m3n-role="control"]')) continue
    const group = node.closest('[data-m3n-role="lyric-fragment"],[data-m3n-role="annotation-frame"]') ?? node
    if (!labels.has(group)) { object(group, 'label', group.textContent); labels.add(group) }
  }
  const canvases = [document.createElement('canvas'), document.createElement('canvas')]
  const raster = (item, canvas, left, top, width, height) => {
    canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    for (const p of item.pieces) {
      ctx.setTransform(2, 0, 0, 2, -left * 2, -top * 2)
      ctx.transform(p.matrix.a, p.matrix.b, p.matrix.c, p.matrix.d, p.matrix.e, p.matrix.f)
      ctx.setLineDash(p.dash); ctx.lineDashOffset = p.dashOffset
      ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineWidth = p.stroke; ctx.lineCap = p.cap; ctx.lineJoin = p.join
      if (p.node.tagName === 'text') {
        ctx.font = p.font; ctx.textAlign = p.align; ctx.textBaseline = 'alphabetic'
        ctx.fillText(p.node.textContent, Number(p.node.getAttribute('x')), Number(p.node.getAttribute('y')))
      } else {
        if (p.fill) ctx.fill(p.path)
        if (p.stroke) ctx.stroke(p.path)
      }
    }
    return ctx.getImageData(0, 0, width, height).data
  }
  const collisions = []
  let candidates = 0
  for (let i = 0; i < objects.length; i++) for (let j = i + 1; j < objects.length; j++) {
    const a = objects[i], b = objects[j]
    const crossLane = a.lane && b.lane && a.lane !== b.lane && (a.lane.startsWith('alternative:') || b.lane.startsWith('alternative:'))
    if (a.kind !== 'label' && b.kind !== 'label' && !crossLane) continue
    const left = Math.max(a.left, b.left), right = Math.min(a.right, b.right), top = Math.max(a.top, b.top), bottom = Math.min(a.bottom, b.bottom)
    if (right <= left || bottom <= top) continue
    candidates++
    const width = Math.max(1, Math.ceil((right - left) * 2)), height = Math.max(1, Math.ceil((bottom - top) * 2))
    const first = raster(a, canvases[0], left, top, width, height), second = raster(b, canvases[1], left, top, width, height)
    let pixels = 0
    for (let k = 3; k < first.length; k += 4) if (first[k] >= 128 && second[k] >= 128) pixels++
    if (pixels) collisions.push({ a: { kind: a.kind, label: a.label, id: a.id }, b: { kind: b.kind, label: b.label, id: b.id }, box: [left, top, right, bottom], opaquePixelsAt2x: pixels })
  }
  return { candidates, collisions, labels: objects.filter(o => o.kind === 'label').length }
}
