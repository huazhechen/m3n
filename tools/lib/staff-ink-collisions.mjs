import { auditNativeInkCollisions } from './native-ink-collisions.mjs'

export function auditStaffSystemCollisions(svg) {
  return auditNativeInkCollisions(svg, { groupSelector: 'g.system' })
}

/** Reuse the independent opaque-pixel audit, with staff-specific object roles.
 * Staff lines intentionally run through noteheads and are not collision objects. */
export function auditStaffInkCollisions(system) {
  const changes = []
  const mark = (selector, name, value) => {
    for (const node of system.querySelectorAll(selector)) {
      // A multi-rest's count and bar are one control, including nested rest groups.
      if (value === 'control' && node.parentElement.closest('g.rest,g.chord')) continue
      changes.push([node, name, node.getAttribute(name)])
      node.setAttribute(name, value)
    }
  }
  mark('g.syl,g.reh,g.dir,g.dynam,g.tempo,g.harm,g.fing,g.mNum,g.repeatMark,g.ending.voltaBracket,g.inline-signature', 'data-m3n-role', 'annotation')
  mark('g.slur,g.tie,g.hairpin,g.octave,g.tupletBracket', 'data-m3n-relation', 'staff-relation')
  mark('g.barLine', 'data-m3n-role', 'bar')
  mark('g.beam', 'data-m3n-role', 'beam')
  mark('g.rest,g.chord', 'data-m3n-role', 'control')
  mark('g.fermata,g.breath,g.trill,g.mordent,g.tupletNum', 'data-m3n-role', 'annotation')
  try {
    const result=auditNativeInkCollisions(system, { independentMusic: true })
    for(const collision of result.collisions)for(const side of ['a','b'])collision[side].class=system.querySelector(`[id="${collision[side].id}"]`)?.getAttribute('class')
    return result
  } finally {
    for (const [node, name, value] of changes) {
      if (value === null) node.removeAttribute(name)
      else node.setAttribute(name, value)
    }
  }
}

/** Browser SVG text getBBox includes unused font ascent/descent. Use painted
 * text metrics and primitive geometry in the outer SVG coordinate system. */
export function staffInkBounds(svg,scope=svg) {
  const context = document.createElement('canvas').getContext('2d')
  const inverse = svg.getCTM().inverse(),
    boxes = []
  for (const node of scope.querySelectorAll('text,path,line,rect,circle,ellipse')) {
    if (node.closest('defs')) continue
    const style = getComputedStyle(node),
      matrix = inverse.multiply(node.getCTM())
    let box = node.getBBox()
    if (node.tagName === 'text') {
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      const m = context.measureText(node.textContent),
        anchor = node.getAttribute('text-anchor'),
        offset = anchor === 'middle' ? m.width / 2 : anchor === 'end' ? m.width : 0
      box = {
        x: Number(node.getAttribute('x')) - offset - m.actualBoundingBoxLeft,
        y: Number(node.getAttribute('y')) - m.actualBoundingBoxAscent,
        width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
        height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
      }
    }
    if (!box.width && !box.height) continue
    const half = style.stroke === 'none' ? 0 : parseFloat(style.strokeWidth) / 2
    boxes.push(
      ...[
        [box.x - half, box.y - half],
        [box.x + box.width + half, box.y - half],
        [box.x - half, box.y + box.height + half],
        [box.x + box.width + half, box.y + box.height + half],
      ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix)),
    )
  }
  const x = Math.min(...boxes.map((p) => p.x)),
    y = Math.min(...boxes.map((p) => p.y))
  return { x, y, width: Math.max(...boxes.map((p) => p.x)) - x, height: Math.max(...boxes.map((p) => p.y)) - y }
}
