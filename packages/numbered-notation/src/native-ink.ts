import { parse, type TNode } from 'txml/txml'
import type { TextMeasurer } from './native-measure.js'

/** Painted bounds, in baseline coordinates. Font size is never an ink height. */
export type NativeInk = { left: number; right: number; top: number; bottom: number }
export function unionNativeInk(boxes: NativeInk[]): NativeInk {
  return { left: Math.min(...boxes.map(b => b.left)), right: Math.max(...boxes.map(b => b.right)),
    top: Math.min(...boxes.map(b => b.top)), bottom: Math.max(...boxes.map(b => b.bottom)) }
}
export function translateNativeInk(b: NativeInk, x: number, y: number): NativeInk {
  return { left: b.left + x, right: b.right + x, top: b.top + y, bottom: b.bottom + y }
}

/** Exact polynomial extrema; no curve sampling or control-point bounding box. */
export function nativePathInk(d: string): NativeInk {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? []
  const points: { x: number; y: number }[] = []
  let i = 0, x = 0, y = 0, sx = 0, sy = 0, command = ''
  const add = (a: number, b: number) => points.push({ x: a, y: b })
  const value = () => {
    const token = tokens[i++]
    if (token === undefined || !Number.isFinite(Number(token))) throw new Error(`Invalid native path: ${d}`)
    return Number(token)
  }
  const bezier = (p: number[], t: number): number => p.length === 1 ? p[0]! : bezier(p.slice(0, -1).map((v, j) => v * (1 - t) + p[j + 1]! * t), t)
  const roots = (p: number[]) => {
    if (p.length === 3) { const a = p[0]! - 2 * p[1]! + p[2]!; return a ? [(p[0]! - p[1]!) / a] : [] }
    const a = -p[0]! + 3 * p[1]! - 3 * p[2]! + p[3]!, b = 2 * (p[0]! - 2 * p[1]! + p[2]!), c = p[1]! - p[0]!
    if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b]
    const disc = b * b - 4 * a * c
    return disc < 0 ? [] : [(-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a)]
  }
  while (i < tokens.length) {
    if (/^[a-z]$/i.test(tokens[i]!)) command = tokens[i++]!
    const op = command.toUpperCase(), relative = command !== op, ox = relative ? x : 0, oy = relative ? y : 0
    if (op === 'Z') { x = sx; y = sy; add(x, y); command = ''; continue }
    if (op === 'M' || op === 'L') {
      x = value() + ox; y = value() + oy; add(x, y)
      if (op === 'M') { sx = x; sy = y; command = relative ? 'l' : 'L' }
    } else if (op === 'H') { x = value() + ox; add(x, y) }
    else if (op === 'V') { y = value() + oy; add(x, y) }
    else if (op === 'Q' || op === 'C') {
      const px = [x], py = [y]
      for (let j = 0; j < (op === 'Q' ? 2 : 3); j++) { px.push(value() + ox); py.push(value() + oy) }
      for (const t of [0, 1, ...roots(px), ...roots(py)].filter(t => t >= 0 && t <= 1)) add(bezier(px, t), bezier(py, t))
      x = px.at(-1)!; y = py.at(-1)!
    } else throw new Error(`Unsupported native path command: ${command}`)
  }
  if (!points.length) throw new Error('Empty native path')
  return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) }
}

const decode = (text: string) => text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) =>
  entity.startsWith('#') ? String.fromCodePoint(entity[1] === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)))
    : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity] ?? entity))

/** Measure exactly the primitive fragment that the SVG painter emits. Unsupported
 * primitives fail visibly rather than silently reserving a nominal font height.
 * Stroke expansion is conservative at corners (native paths use round joins).
 */
export function nativeSvgPieces(svg: string, measurer: TextMeasurer): NativeInk[] {
  const visit = (node: TNode | string): NativeInk[] => {
    if (typeof node === 'string') return []
    const a = node.attributes, num = (key: string, fallback = 0) => Number(a[key] ?? fallback)
    let b: NativeInk | undefined, children: NativeInk[] = []
    if (node.tagName === 'g') {
      children = node.children.flatMap(visit)
    } else if (node.tagName === 'text') {
      const text = decode(node.children.filter(c => typeof c === 'string').join(''))
      const m = measurer.measureText(text, { fontSize: num('font-size', 16), fontFamily: a['font-family'] ?? 'serif', fontWeight: num('font-weight', 400), fontStyle: a['font-style'] === 'italic' ? 'italic' : 'normal' })
      const advance = m.advance ?? m.w, anchor = a['text-anchor'] === 'middle' ? advance / 2 : a['text-anchor'] === 'end' ? advance : 0
      b = { left: num('x') - anchor + (m.inkLeft ?? 0), right: num('x') - anchor + (m.inkRight ?? m.w), top: num('y') - m.baseline, bottom: num('y') - m.baseline + m.h }
    } else if (node.tagName === 'path') b = nativePathInk(a.d!)
    else if (node.tagName === 'rect') b = { left: num('x'), right: num('x') + num('width'), top: num('y'), bottom: num('y') + num('height') }
    else if (node.tagName === 'circle' || node.tagName === 'ellipse') {
      const rx = num(node.tagName === 'circle' ? 'r' : 'rx'), ry = num(node.tagName === 'circle' ? 'r' : 'ry')
      b = { left: num('cx') - rx, right: num('cx') + rx, top: num('cy') - ry, bottom: num('cy') + ry }
    } else if (node.tagName === 'line') b = { left: Math.min(num('x1'), num('x2')), right: Math.max(num('x1'), num('x2')), top: Math.min(num('y1'), num('y2')), bottom: Math.max(num('y1'), num('y2')) }
    else throw new Error(`Unsupported native primitive: ${node.tagName}`)
    return (b ? [b] : children).map(b => {
      if (a.stroke && a.stroke !== 'none') {
        const half = num('stroke-width', 1) / 2
        b = { left: b.left - half, right: b.right + half, top: b.top - half, bottom: b.bottom + half }
      }
      if (a.transform) {
        const match = /^translate\(\s*([-+.\deE]+)[ ,]+([-+.\deE]+)\s*\)$/.exec(a.transform)
        if (!match) throw new Error(`Unsupported native transform: ${a.transform}`)
        b = translateNativeInk(b, Number(match[1]), Number(match[2]))
      }
      return b
    })
  }
  return parse(svg).flatMap(visit)
}

export function nativeSvgInk(svg: string, measurer: TextMeasurer): NativeInk {
  const boxes = nativeSvgPieces(svg, measurer)
  if (!boxes.length) return { left: 0, right: 0, top: 0, bottom: 0 }
  return unionNativeInk(boxes)
}
