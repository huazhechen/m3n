import { SCORE_TEXT_FONT } from '@m3n/numbered-notation'
import { parse } from 'txml/txml'
import { svgPathBbox } from 'svg-path-bbox'
const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')

export type XmlNode = { tagName: string; attributes: Record<string, string>; children: Array<XmlNode | string>; pathInk?: { d: string; boxes: readonly Ink[] }; classTokens?: { raw: string; names: Set<string> } }
export type Ink = { left: number; right: number; top: number; bottom: number }
export const nodes = (node: XmlNode) => node.children.filter((child): child is XmlNode => typeof child !== 'string')
export function hasClass(node: XmlNode, name: string): boolean {
  const value = node.attributes.class ?? ''
  if (value === name) return true
  if (!value) return false
  let saved = node.classTokens
  if (!saved || saved.raw !== value) node.classTokens = saved = { raw: value, names: new Set(value.split(/\s+/)) }
  return saved.names.has(name)
}
export function findAll(node: XmlNode, match: (node: XmlNode) => boolean): XmlNode[] {
  const result: XmlNode[] = []
  const visit = (current: XmlNode) => {
    if (match(current)) result.push(current)
    for (const child of current.children) if (typeof child !== 'string') visit(child)
  }
  visit(node)
  return result
}
export const xml = (node: XmlNode | string): string =>
  typeof node === 'string'
    ? escapeXml(node)
    : `<${node.tagName}${Object.entries(node.attributes)
        .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
        .join('')}>${node.children.map(xml).join('')}</${node.tagName}>`
const decode = (s: string) =>
  s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, v: string) =>
    v.startsWith('#')
      ? String.fromCodePoint(v[1] === 'x' ? parseInt(v.slice(2), 16) : Number(v.slice(1)))
      : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[v] ?? v),
  )
export function readXml(source: string): XmlNode {
  const result = (parse(source) as Array<XmlNode | string>).find(
    (node): node is XmlNode => typeof node !== 'string' && !node.tagName.startsWith('?'),
  )!
  const visit = (node: XmlNode) => {
    node.attributes = Object.fromEntries(Object.entries(node.attributes).map(([k, v]) => [k, decode(v)]))
    node.children = node.children.map((child) => (typeof child === 'string' ? decode(child) : (visit(child), child)))
  }
  visit(result)
  return result
}
export const element = (
  tagName: string,
  attributes: Record<string, string> = {},
  children: Array<XmlNode | string> = [],
): XmlNode => ({ tagName, attributes, children })
export const textContent = (node: XmlNode): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textContent(child))).join('')
export const union = (inks: Ink[]): Ink =>
  inks.length
    ? {
        left: Math.min(...inks.map((b) => b.left)),
        right: Math.max(...inks.map((b) => b.right)),
        top: Math.min(...inks.map((b) => b.top)),
        bottom: Math.max(...inks.map((b) => b.bottom)),
      }
    : { left: 0, right: 0, top: 0, bottom: 0 }
export const moveInk = (b: Ink, x: number, y: number): Ink => ({
  left: b.left + x,
  right: b.right + x,
  top: b.top + y,
  bottom: b.bottom + y,
})
export const overlapsX = (a: Ink, b: Ink, gap = 0) => a.right + gap > b.left && b.right + gap > a.left
export function translate(node: XmlNode, x: number, y: number) {
  node.attributes.transform = `translate(${x} ${y}) ${node.attributes.transform ?? ''}`
}
export type FontInk = { width: number; left: number; right: number; ascent: number; descent: number }
export type MeasureText = (text: string, size: number, bold?: boolean, italic?: boolean, family?: string) => FontInk
export function textMeasurer(): MeasureText {
  const context = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  const cache = new Map<string, FontInk>()
  return (text, size, bold = false, italic = false, family = SCORE_TEXT_FONT) => {
    const key = `${family}:${size}:${bold}:${italic}:${text}`
    const saved = cache.get(key)
    if (saved) return saved
    let result: FontInk
    if (context) {
      context.font = `${italic ? 'italic' : 'normal'} ${bold ? 700 : 400} ${size}px ${family}`
      const m = context.measureText(text)
      result = {
        width: m.width,
        left: -m.actualBoundingBoxLeft,
        right: m.actualBoundingBoxRight,
        ascent: m.actualBoundingBoxAscent,
        descent: m.actualBoundingBoxDescent,
      }
    } else {
      const width = [...text].reduce(
        (n, c) => n + (/[\u200B\u2800]/u.test(c) ? 0 : size * (c.codePointAt(0)! > 255 ? 1 : 0.52)),
        0,
      )
      result = { width, left: 0, right: width, ascent: size * 0.8, descent: size * 0.2 }
    }
    cache.set(key, result)
    return result
  }
}
type Matrix = [number, number, number, number, number, number]
const identity: Matrix = [1, 0, 0, 1, 0, 0]
const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
]
function matrix(raw: string): Matrix {
  let m = identity
  for (const match of raw.matchAll(/(translate|scale|matrix|rotate)\(([^)]+)\)/g)) {
    const v = match[2]!.trim().split(/[ ,]+/).map(Number)
    let t: Matrix = identity
    if (match[1] === 'translate') t = [1, 0, 0, 1, v[0]!, v[1] ?? 0]
    if (match[1] === 'scale') t = [v[0]!, 0, 0, v[1] ?? v[0]!, 0, 0]
    if (match[1] === 'matrix') t = v as Matrix
    if (match[1] === 'rotate') {
      const a = (v[0]! * Math.PI) / 180,
        c = Math.cos(a),
        s = Math.sin(a)
      t = multiply(multiply([1, 0, 0, 1, v[1] ?? 0, v[2] ?? 0], [c, s, -s, c, 0, 0]), [
        1,
        0,
        0,
        1,
        -(v[1] ?? 0),
        -(v[2] ?? 0),
      ])
    }
    m = multiply(m, t)
  }
  return m
}
function transform(b: Ink, m: Matrix): Ink {
  const x1 = m[0] * b.left + m[2] * b.top + m[4], y1 = m[1] * b.left + m[3] * b.top + m[5]
  const x2 = m[0] * b.left + m[2] * b.bottom + m[4], y2 = m[1] * b.left + m[3] * b.bottom + m[5]
  const x3 = m[0] * b.right + m[2] * b.top + m[4], y3 = m[1] * b.right + m[3] * b.top + m[5]
  const x4 = m[0] * b.right + m[2] * b.bottom + m[4], y4 = m[1] * b.right + m[3] * b.bottom + m[5]
  return { left: Math.min(x1, x2, x3, x4), right: Math.max(x1, x2, x3, x4),
    top: Math.min(y1, y2, y3, y4), bottom: Math.max(y1, y2, y3, y4) }
}
export class SvgGeometry {
  private glyphDefinitions?: Map<string, XmlNode>
  get definitions(): Map<string, XmlNode> {
    return this.glyphDefinitions ??= new Map(findAll(this.root, n => Boolean(n.attributes.id)).map(n => [n.attributes.id!, n]))
  }
  private readonly transforms = new Map<string, Matrix>()
  private readonly pathBounds = new Map<string, Ink>()
  private readonly paths = new WeakMap<XmlNode, { d: string; half: number; boxes: readonly Ink[] }>()
  constructor(
    private readonly root: XmlNode,
    readonly measure: MeasureText,
  ) {}
  /** Exclude matching child subtrees without cloning the mutable SVG tree. */
  without(node: XmlNode, omit: (node: XmlNode) => boolean): Ink[] {
    return this.pieces(node, identity, undefined, omit)
  }
  pieces(
    node: XmlNode,
    parent: Matrix = identity,
    inherited: { size: number; bold: boolean; italic: boolean } = { size: 16 / 0.7, bold: false, italic: false },
    omit?: (node: XmlNode) => boolean,
  ): Ink[] {
    const result: Ink[] = []
    this.collect(node, parent, inherited, omit, result)
    return result
  }
  private collect(node: XmlNode, parent: Matrix, inherited: { size: number; bold: boolean; italic: boolean },
    omit: ((node: XmlNode) => boolean) | undefined, result: Ink[]): void {
    const a = node.attributes,
      num = (key: string, fallback = 0) => parseFloat(a[key] ?? String(fallback))
    const raw = a.transform ?? ''
    let local = this.transforms.get(raw)
    if (!local) { local = matrix(raw); this.transforms.set(raw, local) }
    const m = multiply(parent, local)
    if (['defs', 'style', 'desc'].includes(node.tagName)) return
    // Paths dominate music drawing; they do not consume inherited font styles.
    const shape = ['path', 'rect', 'line', 'circle', 'ellipse', 'polygon', 'polyline'].includes(node.tagName)
    const style = shape ? inherited : {
      size: a['font-size'] && num('font-size') > 0 ? num('font-size') : inherited.size,
      bold: a['font-weight'] === 'bold' || a['font-weight'] === '700' || inherited.bold ||
        hasClass(node, 'reh') || hasClass(node, 'tempo') || hasClass(node, 'ending'),
      italic: a['font-style'] === 'italic' || inherited.italic || hasClass(node, 'dynam'),
    }
    if (node.tagName === 'use') {
      const ref = this.definitions.get((a['xlink:href'] ?? a.href ?? '').replace(/^#/, ''))
      if (!ref) throw new Error('五线谱字形引用缺失。')
      this.collect(ref, multiply(m, [1, 0, 0, 1, num('x'), num('y')]), style, undefined, result)
      return
    }
    const half = a.stroke === 'none' ? 0 : num('stroke-width') / 2
    let boxes: readonly Ink[] = []
    if (node.tagName === 'path') {
      const d = a.d ?? ''
      let saved = this.paths.get(node)
      if (!saved || saved.d !== d || saved.half !== half) {
        let raw: readonly Ink[] | undefined = node.pathInk?.d === d ? node.pathInk.boxes : undefined
        if (!raw) raw = ((d.startsWith('M') ? d.match(/M[^M]*/g) : [d]) ?? []).map(part => {
          let bounds = this.pathBounds.get(part)
          if (!bounds) {
            const [left, top, right, bottom] = svgPathBbox(part)
            bounds = { left, right, top, bottom }
            this.pathBounds.set(part, bounds)
          }
          return bounds
        })
        const inflated = raw.map(b => ({ left: b.left - half, right: b.right + half, top: b.top - half, bottom: b.bottom + half }))
        saved = { d, half, boxes: inflated }
        this.paths.set(node, saved)
      }
      for (const box of saved.boxes) result.push(transform(box, m))
      return
    } else if (node.tagName === 'text') {
      const size = Math.max(
        style.size,
        ...findAll(node, (n) => Boolean(n.attributes['font-size'])).map((n) => parseFloat(n.attributes['font-size']!)),
      )
      const content = textContent(node)
        .replace(/[\t\r\n]/g, '')
        .trim()
      if (!content.replace(/[\u200B\u2800]/g, '')) return
      const metrics = this.measure(content, size, style.bold, style.italic),
        anchor = a['text-anchor'] ?? 'start'
      const x = num('x') - (anchor === 'middle' ? metrics.width / 2 : anchor === 'end' ? metrics.width : 0),
        y = num('y')
      boxes = [
        { left: x + metrics.left, right: x + metrics.right, top: y - metrics.ascent, bottom: y + metrics.descent },
      ]
    } else if (['rect', 'line', 'circle', 'ellipse', 'polygon', 'polyline'].includes(node.tagName)) {
      if (node.tagName === 'rect')
        boxes = [{ left: num('x'), right: num('x') + num('width'), top: num('y'), bottom: num('y') + num('height') }]
      else if (node.tagName === 'line')
        boxes = [
          {
            left: Math.min(num('x1'), num('x2')),
            right: Math.max(num('x1'), num('x2')),
            top: Math.min(num('y1'), num('y2')),
            bottom: Math.max(num('y1'), num('y2')),
          },
        ]
      else if (node.tagName === 'circle' || node.tagName === 'ellipse') {
        const rx = num(node.tagName === 'circle' ? 'r' : 'rx'),
          ry = num(node.tagName === 'circle' ? 'r' : 'ry')
        boxes = [{ left: num('cx') - rx, right: num('cx') + rx, top: num('cy') - ry, bottom: num('cy') + ry }]
      } else {
        const points = (a.points ?? '').trim().split(/[ ,]+/).map(Number)
        boxes = [
          {
            left: Math.min(...points.filter((_, i) => i % 2 === 0)),
            right: Math.max(...points.filter((_, i) => i % 2 === 0)),
            top: Math.min(...points.filter((_, i) => i % 2 === 1)),
            bottom: Math.max(...points.filter((_, i) => i % 2 === 1)),
          },
        ]
      }
    } else {
      for (const child of node.children)
        if (typeof child !== 'string' && !omit?.(child)) this.collect(child, m, style, omit, result)
      return
    }
    for (const b of boxes) result.push(transform({ left: b.left - half, right: b.right + half, top: b.top - half, bottom: b.bottom + half }, m))
  }

  ink(node: XmlNode): Ink {
    return union(this.pieces(node))
  }
}
