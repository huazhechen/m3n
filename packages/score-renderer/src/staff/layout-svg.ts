import { SCORE_TEXT_FONT } from '@m3n/numbered-notation'
import { parse } from 'txml/txml'
import { svgPathBbox } from 'svg-path-bbox'
const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')

export type XmlNode = { tagName: string; attributes: Record<string, string>; children: Array<XmlNode | string> }
export type Ink = { left: number; right: number; top: number; bottom: number }
export const nodes = (node: XmlNode) => node.children.filter((child): child is XmlNode => typeof child !== 'string')
export const hasClass = (node: XmlNode, name: string) => (node.attributes.class ?? '').split(/\s+/).includes(name)
export function findAll(node: XmlNode, match: (node: XmlNode) => boolean): XmlNode[] {
  return [...(match(node) ? [node] : []), ...nodes(node).flatMap((child) => findAll(child, match))]
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
const pathBounds = new Map<string, Ink>()
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
  const corners = [
    [b.left, b.top],
    [b.left, b.bottom],
    [b.right, b.top],
    [b.right, b.bottom],
  ].map(([x, y]) => [m[0] * x! + m[2] * y! + m[4], m[1] * x! + m[3] * y! + m[5]])
  return {
    left: Math.min(...corners.map((p) => p[0]!)),
    right: Math.max(...corners.map((p) => p[0]!)),
    top: Math.min(...corners.map((p) => p[1]!)),
    bottom: Math.max(...corners.map((p) => p[1]!)),
  }
}
export class SvgGeometry {
  readonly definitions: Map<string, XmlNode>
  constructor(
    root: XmlNode,
    readonly measure: MeasureText,
  ) {
    this.definitions = new Map(findAll(root, (n) => Boolean(n.attributes.id)).map((n) => [n.attributes.id!, n]))
  }
  pieces(
    node: XmlNode,
    parent: Matrix = identity,
    inherited: { size: number; bold: boolean; italic: boolean } = { size: 16 / 0.7, bold: false, italic: false },
  ): Ink[] {
    const a = node.attributes,
      num = (key: string, fallback = 0) => parseFloat(a[key] ?? String(fallback))
    const m = multiply(parent, matrix(a.transform ?? ''))
    const style = {
      size: a['font-size'] && num('font-size') > 0 ? num('font-size') : inherited.size,
      bold:
        a['font-weight'] === 'bold' ||
        a['font-weight'] === '700' ||
        inherited.bold ||
        ['reh', 'tempo', 'ending'].some((c) => hasClass(node, c)),
      italic: a['font-style'] === 'italic' || inherited.italic || hasClass(node, 'dynam'),
    }
    let boxes: Ink[] = []
    if (['defs', 'style', 'desc'].includes(node.tagName)) return []
    if (node.tagName === 'use') {
      const ref = this.definitions.get((a['xlink:href'] ?? a.href ?? '').replace(/^#/, ''))
      if (!ref) throw new Error('五线谱字形引用缺失。')
      return this.pieces(ref, multiply(m, [1, 0, 0, 1, num('x'), num('y')]), style)
    }
    if (node.tagName === 'path') {
      // Separate strokes leave the empty interior of brackets and hairpins free.
      for (const d of ((a.d ?? '').startsWith('M') ? (a.d ?? '').match(/M[^M]*/g) : [a.d ?? '']) ?? []) {
        let bounds = pathBounds.get(d)
        if (!bounds) {
          const [left, top, right, bottom] = svgPathBbox(d)
          bounds = { left, right, top, bottom }
          if (pathBounds.size > 20000) pathBounds.clear()
          pathBounds.set(d, bounds)
        }
        boxes.push(bounds)
      }
    } else if (node.tagName === 'text') {
      const size = Math.max(
        style.size,
        ...findAll(node, (n) => Boolean(n.attributes['font-size'])).map((n) => parseFloat(n.attributes['font-size']!)),
      )
      const content = textContent(node)
        .replace(/[\t\r\n]/g, '')
        .trim()
      if (!content.replace(/[\u200B\u2800]/g, '')) return []
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
    } else return nodes(node).flatMap((child) => this.pieces(child, m, style))
    const half = a.stroke === 'none' ? 0 : num('stroke-width') / 2
    return boxes.map((b) =>
      transform({ left: b.left - half, right: b.right + half, top: b.top - half, bottom: b.bottom + half }, m),
    )
  }
  ink(node: XmlNode): Ink {
    return union(this.pieces(node))
  }
}
