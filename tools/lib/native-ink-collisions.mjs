/** Browser-only, independent paint test. Rectangle intersection selects candidates;
 * opaque raster overlap confirms a collision, so a curve's empty box is harmless.
 * Every independent painted object participates; compound symbols own their pieces.
 */
export function auditNativeInkCollisions(system, { groupSelector } = {}) {
  const measure = document.createElement('canvas').getContext('2d')
  const colorCanvas = document.createElement('canvas')
  colorCanvas.width = colorCanvas.height = 1
  const color = colorCanvas.getContext('2d', { willReadFrequently: true }), alphas = new Map()
  const paintAlpha = value => {
    if (value === 'none') return 0
    if (!alphas.has(value)) {
      color.clearRect(0, 0, 1, 1); color.fillStyle = value; color.fillRect(0, 0, 1, 1)
      alphas.set(value, color.getImageData(0, 0, 1, 1).data[3] / 255)
    }
    return alphas.get(value)
  }
  const primitiveSelector = 'text,path,line,rect,circle,ellipse,polygon,polyline'
  const rootInverse = (system.ownerSVGElement ?? system).getCTM().inverse()
  function* ancestors(node) { for (; node && node !== system.parentElement; node = node.parentElement) yield node }
  const primitives = new Map()
  for (const node of system.querySelectorAll(primitiveSelector)) {
    if (node.closest('defs,clipPath,mask,pattern,marker,symbol')) continue
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility !== 'visible' || [...ancestors(node)].some(n => getComputedStyle(n).display === 'none' || Number(getComputedStyle(n).opacity) === 0)) continue
    const opacity = [...ancestors(node)].reduce((value, ancestor) => value * Number(getComputedStyle(ancestor).opacity), 1)
    const matrix = rootInverse.multiply(node.getCTM())
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const anchor = style.textAnchor, align = anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left'
    const number = name => Number(node.getAttribute(name) ?? 0)
    let box
    if (node.tagName === 'text') {
      measure.font = font; measure.textAlign = 'left'; measure.textBaseline = 'alphabetic'
      const m = measure.measureText(node.textContent)
      const x = number('x') - (align === 'center' ? m.width / 2 : align === 'right' ? m.width : 0)
      box = { x: x - m.actualBoundingBoxLeft, y: number('y') - m.actualBoundingBoxAscent, width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent }
    } else box = node.getBBox()
    const stroke = style.stroke !== 'none' ? parseFloat(style.strokeWidth) : 0
    const miterLimit = Number(style.strokeMiterlimit)
    const padding = stroke / 2 * (style.strokeLinejoin === 'miter' ? Math.max(1, miterLimit) : style.strokeLinecap === 'square' ? Math.SQRT2 : 1)
    const corners = [[box.x - padding, box.y - padding], [box.x + box.width + padding, box.y - padding], [box.x - padding, box.y + box.height + padding], [box.x + box.width + padding, box.y + box.height + padding]].map(([x,y]) => new DOMPoint(x,y).matrixTransform(matrix))
    const path = new Path2D(), tag = node.tagName
    if (tag === 'path') path.addPath(new Path2D(node.getAttribute('d')))
    if (tag === 'rect') {
      const rx = Math.min(number('rx') || number('ry'), number('width') / 2)
      const ry = Math.min(number('ry') || number('rx'), number('height') / 2)
      path.roundRect(number('x'), number('y'), number('width'), number('height'), rx && ry ? { x: rx, y: ry } : 0)
    }
    if (tag === 'polygon' || tag === 'polyline') {
      for (let i = 0; i < node.points.numberOfItems; i++) { const p = node.points.getItem(i); if (i) path.lineTo(p.x, p.y); else path.moveTo(p.x, p.y) }
      if (tag === 'polygon') path.closePath()
    }
    if (tag === 'line') { path.moveTo(number('x1'), number('y1')); path.lineTo(number('x2'), number('y2')) }
    if (tag === 'circle') path.arc(number('cx'), number('cy'), number('r'), 0, Math.PI * 2)
    if (tag === 'ellipse') path.ellipse(number('cx'), number('cy'), number('rx'), number('ry'), 0, 0, Math.PI * 2)
    primitives.set(node, { node, joins: (node.closest('[data-m3n-join]')?.getAttribute('data-m3n-join') ?? '').split(/\s+/).filter(Boolean), path, matrix, font, align, stroke, miterLimit, fill: style.fill !== 'none' && tag !== 'line', fillRule: style.fillRule, fillAlpha: paintAlpha(style.fill) * Number(style.fillOpacity) * opacity, strokeAlpha: paintAlpha(style.stroke) * Number(style.strokeOpacity) * opacity, cap: style.strokeLinecap, join: style.strokeLinejoin, dash: style.strokeDasharray === 'none' ? [] : style.strokeDasharray.split(/[ ,]+/).map(v => parseFloat(v)), dashOffset: parseFloat(style.strokeDashoffset),
      left: Math.min(...corners.map(p => p.x)), right: Math.max(...corners.map(p => p.x)), top: Math.min(...corners.map(p => p.y)), bottom: Math.max(...corners.map(p => p.y)) })
  }
  const objects = [], claimed = new Set()
  const object = (node, kind, label, filter = () => true) => {
    const nodes = node.matches(primitiveSelector) ? [node] : [...node.querySelectorAll(primitiveSelector)].filter(filter)
    const pieces = nodes.map(n => primitives.get(n)).filter(Boolean)
    if (!pieces.length) return
    for (const piece of pieces) claimed.add(piece.node)
    objects.push({ kind, label, id: node.getAttribute('data-m3n-id') ?? node.id, lane: node.closest('[data-m3n-lane]')?.getAttribute('data-m3n-lane'), pieces,
      left: Math.min(...pieces.map(p => p.left)), right: Math.max(...pieces.map(p => p.right)), top: Math.min(...pieces.map(p => p.top)), bottom: Math.max(...pieces.map(p => p.bottom)) })
  }
  for (const node of system.querySelectorAll('g.note')) object(node, 'music', '', n => !n.closest('[data-m3n-role="mark"],[data-m3n-role="annotation"],.verse'))
  for (const node of system.querySelectorAll('[data-m3n-role="bar"]')) object(node, 'bar', '')
  for (const node of system.querySelectorAll('[data-m3n-role="beam"]')) object(node, 'music', 'beam', n => !n.closest('.verse,[data-m3n-role="annotation"]'))
  for (const node of system.querySelectorAll('[data-m3n-role="control"]')) object(node, node.getAttribute('data-m3n-control') === 'passes' ? 'label' : 'control', node.getAttribute('data-m3n-control'))
  for (const node of system.querySelectorAll('[data-m3n-relation]')) {
    if (!node.parentElement.closest('[data-m3n-relation]')) object(node, 'relation', node.getAttribute('data-m3n-relation'))
  }
  for (const node of system.querySelectorAll('[data-m3n-role="mark"]')) {
    const name = node.getAttribute('data-m3n-mark')
    object(node, ['tip', 'brk', 'hold', 'str'].includes(name) ? 'music' : 'label', name)
  }
  const labels = new Set()
  for (const node of system.querySelectorAll('[data-m3n-role="annotation"],[data-m3n-role="lyric"],[data-m3n-role="lyric-prefix"],[data-m3n-role="navigation"],[data-m3n-role="repeat-count"]')) {
    // Inline pass text is already represented by its complete control group.
    if (node.closest('[data-m3n-role="control"]')) continue
    const group = node.closest('[data-m3n-role="lyric-fragment"],[data-m3n-role="annotation-frame"]') ?? node
    if (!labels.has(group)) { object(group, 'label', group.textContent); labels.add(group) }
  }
  // Untagged ink is independently audited too. Structural rules and white
  // knockout backgrounds are explicitly non-obstacles in the score contract.
  for (const [node] of primitives) {
    if (claimed.has(node) || node.closest('.staff-line,[data-m3n-role="measure-number"]')) continue
    if (getComputedStyle(node).fill === 'rgb(255, 255, 255)' && getComputedStyle(node).stroke === 'none') continue
    const owner = node.closest('[data-m3n-role],[data-m3n-ink-object]') ?? node
    object(owner, 'ink', owner.getAttribute('data-m3n-role') ?? owner.tagName, n => !claimed.has(n))
  }
  if (groupSelector) {
    objects.length = 0
    for (const node of system.querySelectorAll(groupSelector)) object(node, 'label', 'system')
  }
  // Fixed-size tiles bound raster memory even for large continuous scores.
  const tileSize = 256
  const canvases = [document.createElement('canvas'), document.createElement('canvas')]
  for (const canvas of canvases) { canvas.width = tileSize; canvas.height = tileSize }
  // Compare paint coverage for every nonzero paint opacity; antialias fringe
  // alone must not collide, and translucent ink must not disappear.
  const raster = (item, canvas, left, top, width, height) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.resetTransform(); ctx.clearRect(0, 0, tileSize, tileSize)
    for (const p of item.pieces) {
      ctx.setTransform(2, 0, 0, 2, -left * 2, -top * 2)
      ctx.transform(p.matrix.a, p.matrix.b, p.matrix.c, p.matrix.d, p.matrix.e, p.matrix.f)
      ctx.setLineDash(p.dash); ctx.lineDashOffset = p.dashOffset
      ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineWidth = p.stroke; ctx.lineCap = p.cap; ctx.lineJoin = p.join; ctx.miterLimit = p.miterLimit
      if (p.node.tagName === 'text') {
        ctx.font = p.font; ctx.textAlign = p.align; ctx.textBaseline = 'alphabetic'
        if (p.fill) { ctx.globalAlpha = p.fillAlpha > 0 ? 1 : 0; ctx.fillText(p.node.textContent, Number(p.node.getAttribute('x')), Number(p.node.getAttribute('y'))) }
        if (p.stroke) { ctx.globalAlpha = p.strokeAlpha > 0 ? 1 : 0; ctx.strokeText(p.node.textContent, Number(p.node.getAttribute('x')), Number(p.node.getAttribute('y'))) }
      } else {
        if (p.fill) { ctx.globalAlpha = p.fillAlpha > 0 ? 1 : 0; ctx.fill(p.path, p.fillRule) }
        if (p.stroke) { ctx.globalAlpha = p.strokeAlpha > 0 ? 1 : 0; ctx.stroke(p.path) }
      }
    }
    return ctx.getImageData(0, 0, width, height).data
  }
  const collisions = [], pairs = []
  const ordered = objects.map((object, index) => ({ object, index })).sort((a,b) => a.object.left - b.object.left || a.index - b.index)
  for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
    const a = ordered[i], b = ordered[j]
    if (b.object.left >= a.object.right) break
    if (b.object.top < a.object.bottom && a.object.top < b.object.bottom)
      pairs.push(a.index < b.index ? [a.index, b.index] : [b.index, a.index])
  }
  let candidates = 0
  for (const [i, j] of pairs.sort((a,b) => a[0] - b[0] || a[1] - b[1])) {
    const a = objects[i], b = objects[j]
    // Sharing a primitive denotes one compound object, never self-collision.
    if (a.pieces.some(p => b.pieces.includes(p))) continue
    const left = Math.max(a.left, b.left), right = Math.min(a.right, b.right), top = Math.max(a.top, b.top), bottom = Math.min(a.bottom, b.bottom)
    if (right <= left || bottom <= top) continue
    candidates++
    const width = Math.max(1, Math.ceil((right - left) * 2)), height = Math.max(1, Math.ceil((bottom - top) * 2))
    let pixels = 0
    for (let ty = 0; ty < height; ty += tileSize) for (let tx = 0; tx < width; tx += tileSize) {
      const w = Math.min(tileSize, width - tx), h = Math.min(tileSize, height - ty)
      const overlap = new Uint8Array(w * h)
      const compare = (firstObject, secondObject) => {
        const first = raster(firstObject, canvases[0], left + tx / 2, top + ty / 2, w, h)
        const second = raster(secondObject, canvases[1], left + tx / 2, top + ty / 2, w, h)
        for (let k = 3; k < first.length; k += 4) if (first[k] >= 128 && second[k] >= 128) overlap[(k - 3) / 4] = 1
      }
      // Explicit audit groups are independent; local joins cannot connect them.
      if (!groupSelector && a.pieces.some(p => p.joins.length) && b.pieces.some(p => p.joins.length)) {
        for (const p of a.pieces) for (const q of b.pieces) {
          if (p.right <= q.left || q.right <= p.left || p.bottom <= q.top || q.bottom <= p.top) continue
          if (!p.joins.some(join => q.joins.includes(join))) compare({ pieces: [p] }, { pieces: [q] })
        }
      } else compare(a, b)
      pixels += overlap.reduce((sum, value) => sum + value, 0)
    }
    if (pixels) collisions.push({ a: { kind: a.kind, label: a.label, id: a.id }, b: { kind: b.kind, label: b.label, id: b.id }, box: [left, top, right, bottom], opaquePixelsAt2x: pixels })
  }
  return { candidates, collisions, labels: objects.filter(o => o.kind === 'label').length }
}
