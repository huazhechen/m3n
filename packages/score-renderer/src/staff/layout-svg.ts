import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { SCORE_TEXT_FONT, scoreFontFamily, fontDesignMeasurer } from '@m3n/numbered-notation'
import { parse } from 'txml/txml'
import { svgPathBbox } from 'svg-path-bbox'
import { staffCharacterInk } from './staff-music-font.js'
import type { StaffNumericPath } from './staff-glyph-primitive.js'
const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')

export type XmlRenderOptions = { resolvedMusicGlyphs?: boolean }
export type XmlNode = { tagName: string; attributes: Record<string, string>; children: Array<XmlNode | string>; textValue?: string; geometryChildren?: () => XmlNode[]; preparedMusicInk?: { boxes: readonly Ink[]; classes: readonly string[] }; numericInk?: readonly Ink[]; renderNodes?: (options?: XmlRenderOptions) => Array<XmlNode | string>; numericPath?: StaffNumericPath; pathInk?: { d: string; boxes: readonly Ink[] }; classTokens?: { raw: string; names: Set<string> } }
export type Ink = { left: number; right: number; top: number; bottom: number }
export const nodes = (node: XmlNode) => node.children.filter((child): child is XmlNode => typeof child !== 'string')
export function hasClass(node: XmlNode, name: string): boolean {
  const value = node.attributes.class ?? ''
  if (value === name) return true
  if (!value || value.length <= name.length || !value.includes(name) || !/\s/.test(value)) return false
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
export const xml = (node: XmlNode | string, options?: XmlRenderOptions): string =>
  typeof node === 'string'
    ? escapeXml(node)
    : node.renderNodes ? node.renderNodes(options).map(child => xml(child, options)).join('')
    : `<${node.tagName}${Object.entries(node.attributes)
        .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
        .join('')}>${node.children.map(child => xml(child, options)).join('')}</${node.tagName}>`
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
const pathOwners = new WeakMap<Record<string, string>, XmlNode>()
const numericPathAttribute: PropertyDescriptor = {
  enumerable: true, configurable: true,
  get(this: Record<string, string>) { return pathOwners.get(this)!.numericPath!.text() },
  set(this: Record<string, string>, value: string) {
    pathOwners.get(this)!.numericPath = undefined
    pathOwners.delete(this)
    Object.defineProperty(this, 'd', { value, enumerable: true, configurable: true, writable: true })
  },
}
export function setNumericPath(node: XmlNode, primitive: StaffNumericPath): void {
  node.numericPath = primitive
  pathOwners.set(node.attributes, node)
  Object.defineProperty(node.attributes, 'd', numericPathAttribute)
}
export const textContent = (node: XmlNode): string =>
  node.textValue ?? node.children.map((child) => (typeof child === 'string' ? child : textContent(child))).join('')
export function union(inks: readonly Ink[]): Ink {
  if (!inks.length) return { left: 0, right: 0, top: 0, bottom: 0 }
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
  for (const box of inks) {
    left = Math.min(left, box.left); right = Math.max(right, box.right)
    top = Math.min(top, box.top); bottom = Math.max(bottom, box.bottom)
  }
  return { left, right, top, bottom }
}
export const moveInk = (b: Ink, x: number, y: number): Ink => ({
  left: b.left + x,
  right: b.right + x,
  top: b.top + y,
  bottom: b.bottom + y,
})
export const overlapsX = (a: Ink, b: Ink, gap = 0) => a.right + gap > b.left && b.right + gap > a.left
/** Stable horizontal queries over immutable pieces followed by append-only
 * placed attachments. Queries preserve source order, including point ink. */
export class InkRangeIndex {
  private readonly sorted: Array<{ box: Ink; index: number }>
  private readonly maximum: number[] = []
  private readonly count: number
  constructor(private readonly pieces: readonly Ink[]) {
    this.count = pieces.length
    this.sorted = pieces.map((box, index) => ({ box, index })).sort((a, b) => a.box.left - b.box.left)
    let right = -Infinity
    for (const item of this.sorted) { right = Math.max(right, item.box.right); this.maximum.push(right) }
  }
  query(left: number, right: number, gap = 0): Ink[] {
    let low = 0, high = this.count
    while (low < high) { const mid = (low + high) >>> 1; if (this.maximum[mid]! + gap <= left) low = mid + 1; else high = mid }
    const found: Array<{ box: Ink; index: number }> = []
    for (let index = low; index < this.count; index++) {
      const item = this.sorted[index]!
      if (item.box.left >= right + gap) break
      if (item.box.right + gap > left) found.push(item)
    }
    found.sort((a, b) => a.index - b.index)
    const result = found.map(item => item.box)
    for (let index = this.count; index < this.pieces.length; index++) {
      const box = this.pieces[index]!
      if (box.left < right + gap && box.right + gap > left) result.push(box)
    }
    return result
  }
}
export function translate(node: XmlNode, x: number, y: number) {
  node.attributes.transform = `translate(${x} ${y}) ${node.attributes.transform ?? ''}`
}
export type FontInk = { width: number; left: number; right: number; ascent: number; descent: number }
export type MeasureText = ((text: string, size: number, bold?: boolean, italic?: boolean, family?: string) => FontInk) & { readonly designMetrics?: boolean }
export function textMeasurer(systemCjk = false): MeasureText {
  const design = systemCjk ? undefined : fontDesignMeasurer()
  const context = !design && typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  const cache = new Map<string, FontInk>()
  const measure: MeasureText = (text, size, bold = false, italic = false, family = SCORE_TEXT_FONT) => {
    family = scoreFontFamily(family, systemCjk)
    const key = `${family}:${size}:${bold}:${italic}:${text}`
    const saved = cache.get(key)
    if (saved) return saved
    let result: FontInk
    if (design) {
      const m = design.measureText(text, { fontFamily: family, fontSize: size,
        fontWeight: bold ? scoreLayoutConfig.fonts.boldWeight : scoreLayoutConfig.fonts.textWeight,
        fontStyle: italic ? 'italic' : 'normal' })
      result = { width: m.advance ?? m.w, left: m.inkLeft ?? 0, right: m.inkRight ?? m.w,
        ascent: m.baseline, descent: m.h - m.baseline }
    } else if (context) {
      context.font = `${italic ? 'italic' : 'normal'} ${bold ? scoreLayoutConfig.fonts.boldWeight : scoreLayoutConfig.fonts.textWeight} ${size}px ${family}`
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
  return Object.assign(measure, { designMetrics: Boolean(design) })
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
function transform(b: Ink, m: Matrix, borrow = false): Ink {
  if (m === identity) return borrow ? b : { left: b.left, right: b.right, top: b.top, bottom: b.bottom }
  if (m[1] === 0 && m[2] === 0) {
    const left = m[0] * b.left + m[4], right = m[0] * b.right + m[4]
    const top = m[3] * b.top + m[5], bottom = m[3] * b.bottom + m[5]
    return { left: Math.min(left, right), right: Math.max(left, right), top: Math.min(top, bottom), bottom: Math.max(top, bottom) }
  }
  const x1 = m[0] * b.left + m[2] * b.top + m[4], y1 = m[1] * b.left + m[3] * b.top + m[5]
  const x2 = m[0] * b.left + m[2] * b.bottom + m[4], y2 = m[1] * b.left + m[3] * b.bottom + m[5]
  const x3 = m[0] * b.right + m[2] * b.top + m[4], y3 = m[1] * b.right + m[3] * b.top + m[5]
  const x4 = m[0] * b.right + m[2] * b.bottom + m[4], y4 = m[1] * b.right + m[3] * b.bottom + m[5]
  return { left: Math.min(x1, x2, x3, x4), right: Math.max(x1, x2, x3, x4),
    top: Math.min(y1, y2, y3, y4), bottom: Math.max(y1, y2, y3, y4) }
}
function intersects(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const name of a) if (b.has(name)) return true
  return false
}
type OmitNode = ((node: XmlNode) => boolean) & { classNames?: ReadonlySet<string> }
function omitClasses(classNames: readonly string[]): OmitNode {
    const names = new Set(classNames)
    const omit: OmitNode = child => {
      const raw = child.attributes.class
      if (!raw) return false
      if (names.has(raw)) return true
      if (!/\s/.test(raw)) return false
      let saved = child.classTokens
      if (!saved || saved.raw !== raw) child.classTokens = saved = { raw, names: new Set(raw.split(/\s+/)) }
      for (const name of saved.names) if (names.has(name)) return true
      return false
    }
    omit.classNames = names
    return omit
}
type InkSink = { push(box: Ink): unknown }
class InkBounds implements InkSink {
  private count = 0
  left = Infinity; right = -Infinity; top = Infinity; bottom = -Infinity
  push(box: Ink) {
    this.count++
    this.left = Math.min(this.left, box.left); this.right = Math.max(this.right, box.right)
    this.top = Math.min(this.top, box.top); this.bottom = Math.max(this.bottom, box.bottom)
  }
  value(): Ink { return this.count === 0 ? { left: 0, right: 0, top: 0, bottom: 0 }
    : { left: this.left, right: this.right, top: this.top, bottom: this.bottom } }
}
export class SvgGeometry {
  private glyphDefinitions?: Map<string, XmlNode>
  get definitions(): Map<string, XmlNode> {
    return this.glyphDefinitions ??= new Map(findAll(this.root, n => Boolean(n.attributes.id)).map(n => [n.attributes.id!, n]))
  }
  private readonly staticPieces = new WeakMap<XmlNode, { transform: string; boxes: Ink[]; positioned?: { matrix: Matrix; boxes: Ink[] }; block: XmlNode; descendants?: XmlNode[]; classes?: Set<string> }>()
  private staticExcluded?: ReadonlySet<string>
  private safeFilters = new WeakMap<OmitNode, boolean>()
  private readonly transforms = new Map<string, Matrix>()
  private readonly pathBounds = new Map<string, Ink>()
  private readonly paths = new WeakMap<XmlNode, { d: string | StaffNumericPath; half: number; boxes: readonly Ink[] }>()
  private readonly leafTextInk = new WeakMap<XmlNode, { content: string; size: number; bold: boolean; italic: boolean;
    x: string | undefined; y: string | undefined; anchor: string; boxes: Ink[] }>()
  constructor(
    private readonly root: XmlNode,
    readonly measure: MeasureText,
    // Internal engraving readers never mutate returned boxes. Public/default
    // queries continue returning defensive copies, including numeric paths.
    private readonly borrowImmutableInk = false,
  ) {}
  /** Compile immutable music blocks after drawing and before attachments move.
   * The caller excludes mutable subtrees. Root transforms stay live; filtered
   * queries fall back whenever a filter selects a node inside a compiled block. */
  compileStatic(node: XmlNode, mutable: (node: XmlNode) => boolean, excludedClasses?: readonly string[]): void {
    this.staticExcluded = excludedClasses ? new Set(excludedClasses) : undefined
    this.safeFilters = new WeakMap()
    const save = (block: XmlNode) => {
      this.staticPieces.set(block, { block, transform: block.attributes.transform ?? '', boxes: this.pieces(block) })
    }
    const visit = (current: XmlNode): boolean => {
      if (mutable(current) || current.tagName === 'text' || current.tagName === 'tspan') return false
      // Drawing already collected these immutable note primitives. Trust that
      // preparation only for internal readers and an explicitly class-based
      // mutation policy; arbitrary public filters still traverse the tree.
      const prepared = current.preparedMusicInk
      if (this.borrowImmutableInk && prepared && this.staticExcluded
        && !prepared.classes.some(name => this.staticExcluded!.has(name)) && !current.attributes.transform) {
        this.staticPieces.set(current, { block: current, transform: '', boxes: [...prepared.boxes] })
        return true
      }
      if (current.numericInk) return true
      const stable: boolean[] = []
      let all = true
      for (const child of current.children) {
        const fixed = typeof child === 'string' || visit(child)
        stable.push(fixed)
        if (!fixed) all = false
      }
      if (all) return true
      if (hasClass(current, 'staff')) {
        const output: Array<XmlNode | string> = []
        let run: XmlNode[] = []
        const flush = () => {
          if (!run.length) return
          if (run.length === 1) { save(run[0]!); output.push(run[0]!) }
          else {
            const members = run
            const block = element('g', { class: 'm3n-music-block' }, members)
            block.renderNodes = () => members
            save(block); output.push(block)
          }
          run = []
        }
        for (let i = 0; i < current.children.length; i++) {
          const child = current.children[i]!
          if (typeof child !== 'string' && stable[i] && !hasClass(child, 'staff-line')) run.push(child)
          else { flush(); output.push(child); if (typeof child !== 'string' && stable[i]) save(child) }
        }
        flush(); current.children = output
      } else for (let i = 0; i < current.children.length; i++) {
        const child = current.children[i]!
        if (typeof child !== 'string' && stable[i]) save(child)
      }
      return false
    }
    if (visit(node)) save(node)
  }
  /** Exclude matching child subtrees without cloning the mutable SVG tree. */
  without(node: XmlNode, omit: OmitNode): Ink[] {
    return this.pieces(node, identity, undefined, omit)
  }
  withoutClasses(node: XmlNode, classNames: readonly string[]): Ink[] {
    return this.without(node, omitClasses(classNames))
  }
  partitionWithoutClasses(node: XmlNode, classes: readonly string[]): { all: Ink[]; without: Ink[] } {
    const all: Ink[] = [], without: Ink[] = []
    this.collect(node, identity, { size: scoreLayoutConfig.staff.text / scoreLayoutConfig.staff.engine.scale, bold: false, italic: false }, undefined, all, { result: without, omit: omitClasses(classes) }, false)
    return { all, without }
  }
  /** Emit final scaled boxes directly. Each occurrence owns its output box,
   * even when included and excluded nodes borrow the same immutable ink. */
  partitionScaledWithoutClasses(node: XmlNode, classes: readonly string[], scale: number, selectedClasses?: readonly string[]): { all: Ink[]; without: Ink[]; boundary: Ink[]; selected: Ink[] } {
    const all: Ink[] = [], without: Ink[] = [], boundary: Ink[] = [], selected: Ink[] = []
    const output: InkSink = { push: box => {
      const scaled = { left: box.left * scale, right: box.right * scale,
        top: box.top * scale, bottom: box.bottom * scale }
      all.push(scaled)
    } }
    // collect emits to the main sink before the filtered sink for each box.
    const filtered: InkSink = { push: () => { without.push(all[all.length - 1]!) } }
    this.collect(node, identity, { size: scoreLayoutConfig.staff.text / scoreLayoutConfig.staff.engine.scale, bold: false, italic: false },
      undefined, output, { result: filtered, omit: omitClasses(classes) }, this.borrowImmutableInk, selectedClasses && {
        result: { push: () => { selected.push(all[all.length - 1]!) } }, match: omitClasses(selectedClasses),
      })
    let index = 0
    for (const box of all) {
      if (box === without[index]) index++
      else boundary.push(box)
    }
    return { all, without, boundary, selected }
  }
  pieces(
    node: XmlNode,
    parent: Matrix = identity,
    inherited: { size: number; bold: boolean; italic: boolean } = { size: scoreLayoutConfig.staff.text / scoreLayoutConfig.staff.engine.scale, bold: false, italic: false },
    omit?: OmitNode,
  ): Ink[] {
    const result: Ink[] = []
    this.collect(node, parent, inherited, omit, result)
    return result
  }
  private unaffected(compiled: { block: XmlNode; descendants?: XmlNode[]; classes?: Set<string> }, filter: OmitNode | undefined): boolean {
      if (!filter) return true
      if (filter.classNames) {
        let known = this.safeFilters.get(filter)
        if (known === undefined) {
          known = Boolean(this.staticExcluded)
          if (this.staticExcluded) for (const name of filter.classNames) if (!this.staticExcluded.has(name)) { known = false; break }
          this.safeFilters.set(filter, known)
        }
        if (known) return true
      }
      if (filter.classNames) {
        if (!compiled.classes) {
          const classes = new Set<string>()
          const visit = (node: XmlNode, include: boolean) => {
            const raw = include && node.attributes.class
            if (raw) {
              if (!/\s/.test(raw)) classes.add(raw)
              else {
                let saved = node.classTokens
                if (!saved || saved.raw !== raw) node.classTokens = saved = { raw, names: new Set(raw.split(/\s+/)) }
                for (const name of saved.names) classes.add(name)
              }
            }
            // Numeric music already describes all semantic descendants.
            // Class queries can use that summary without materializing virtual
            // event/note wrappers. Arbitrary predicates still traverse below.
            const prepared = this.borrowImmutableInk && node.preparedMusicInk
            if (prepared) { for (const name of prepared.classes) classes.add(name); return }
            for (const child of node.geometryChildren?.() ?? node.children)
              if (typeof child !== 'string') visit(child, true)
          }
          visit(compiled.block, false)
          compiled.classes = classes
        }
        return !intersects(compiled.classes, filter.classNames)
      }
      if (!compiled.descendants) {
        const descendants: XmlNode[] = []
        const visit = (node: XmlNode) => {
          for (const child of node.geometryChildren?.() ?? node.children) if (typeof child !== 'string') {
            descendants.push(child); visit(child)
          }
        }
        visit(compiled.block); compiled.descendants = descendants
      }
      return !compiled.descendants.some(filter)
  }
  private collect(node: XmlNode, parent: Matrix, inherited: { size: number; bold: boolean; italic: boolean },
    omit: OmitNode | undefined, result: InkSink, secondary?: { result: InkSink; omit: OmitNode }, borrow = this.borrowImmutableInk,
    selection?: { result: InkSink; match: OmitNode }): void {
    // A matching subtree emits into both channels. Nested matches must not
    // duplicate ink, and the main sink runs first for direct scaled output.
    if (selection?.match(node)) {
      const main = result, selected = selection.result
      result = { push: box => { main.push(box); selected.push(box) } }
      selection = undefined
    }
    const compiled = this.staticPieces.get(node)
    if (compiled && compiled.transform === (node.attributes.transform ?? '') && this.unaffected(compiled, omit) && this.unaffected(compiled, secondary?.omit) && this.unaffected(compiled, selection?.match)) {
      if (borrow && parent !== identity) {
        // Engraving readers treat compiled ink as immutable. Repeated filtered
        // queries can share the same transformed pieces until an ancestor moves.
        let saved = compiled.positioned
        if (!saved || saved.matrix.some((value, index) => value !== parent[index])) {
          saved = { matrix: parent, boxes: compiled.boxes.map(box => transform(box, parent, true)) }
          compiled.positioned = saved
        }
        for (const placed of saved.boxes) { result.push(placed); secondary?.result.push(placed) }
      } else for (const box of compiled.boxes) { const placed = transform(box, parent, borrow); result.push(placed); secondary?.result.push(placed) }
      return
    }
    const a = node.attributes
    const raw = a.transform ?? ''
    let m = parent
    if (raw) {
      let local = this.transforms.get(raw)
      if (!local) { local = matrix(raw); this.transforms.set(raw, local) }
      m = multiply(parent, local)
    }
    // Relation placement queries music before compileStatic runs. The numeric
    // event already owns the exact primitive boxes; avoid walking its note
    // wrappers again. Arbitrary filters must still inspect the real children.
    const prepared = this.borrowImmutableInk && node.preparedMusicInk
    if (prepared && (!omit || omit.classNames && !prepared.classes.some(name => omit.classNames!.has(name)))
      && (!secondary || secondary.omit.classNames && !prepared.classes.some(name => secondary.omit.classNames!.has(name)))
      && (!selection || selection.match.classNames && !prepared.classes.some(name => selection.match.classNames!.has(name)))) {
      for (const box of prepared.boxes) { const placed = transform(box, m, borrow); result.push(placed); secondary?.result.push(placed) }
      return
    }
    if (node.numericInk) { for (const box of node.numericInk) { const placed = transform(box, m, borrow); result.push(placed); secondary?.result.push(placed) }; return }
    const num = (key: string, fallback = 0) => parseFloat(a[key] ?? String(fallback))
    if (['defs', 'style', 'desc'].includes(node.tagName)) return
    // Paths dominate music drawing; they do not consume inherited font styles.
    const shape = ['path', 'rect', 'line', 'circle', 'ellipse', 'polygon', 'polyline'].includes(node.tagName)
    let style = inherited
    if (!shape) {
      const size = a['font-size'] && num('font-size') > 0 ? num('font-size') : inherited.size
      const bold = a['font-weight'] === 'bold' || a['font-weight'] === String(scoreLayoutConfig.fonts.boldWeight) || inherited.bold || hasClass(node, 'reh')
      const italic = a['font-style'] === 'italic' || inherited.italic || hasClass(node, 'dynam')
      if (size !== inherited.size || bold !== inherited.bold || italic !== inherited.italic) style = { size, bold, italic }
    }
    if (node.tagName === 'use') {
      const ref = this.definitions.get((a['xlink:href'] ?? a.href ?? '').replace(/^#/, ''))
      if (!ref) throw new Error('五线谱字形引用缺失。')
      this.collect(ref, multiply(m, [1, 0, 0, 1, num('x'), num('y')]), style, undefined, result, secondary, borrow, selection)
      return
    }
    const half = a.stroke === 'none' ? 0 : num('stroke-width') / 2
    let boxes: readonly Ink[] = []
    if (node.tagName === 'path') {
      const d = node.numericPath ?? a.d ?? ''
      let saved = this.paths.get(node)
      if (!saved || saved.d !== d || saved.half !== half) {
        let raw: readonly Ink[] | undefined = typeof d !== 'string' ? d.boxes : node.pathInk?.d === d ? node.pathInk.boxes : undefined
        if (!raw && typeof d === 'string') raw = ((d.startsWith('M') ? d.match(/M[^M]*/g) : [d]) ?? []).map(part => {
          let bounds = this.pathBounds.get(part)
          if (!bounds) {
            const [left, top, right, bottom] = svgPathBbox(part)
            bounds = { left, right, top, bottom }
            this.pathBounds.set(part, bounds)
          }
          return bounds
        })
        const inflated = raw!.map(b => ({ left: b.left - half, right: b.right + half, top: b.top - half, bottom: b.bottom + half }))
        saved = { d, half, boxes: inflated }
        this.paths.set(node, saved)
      }
      for (const box of saved.boxes) { const placed = transform(box, m, borrow); result.push(placed); secondary?.result.push(placed) }
      return
    } else if (node.tagName === 'text' && a['font-family'] === scoreLayoutConfig.fonts.music) {
      boxes = staffCharacterInk(textContent(node), num('font-size', style.size), num('x'), num('y'))
    } else if (node.tagName === 'text') {
      const leaf = !node.children.length || node.children.length === 1 && typeof node.children[0] === 'string'
      const size = leaf ? Math.max(style.size, a['font-size'] ? parseFloat(a['font-size']) : -Infinity) : Math.max(
        style.size,
        ...findAll(node, (n) => Boolean(n.attributes['font-size'])).map((n) => parseFloat(n.attributes['font-size']!)),
      )
      const content = textContent(node)
        .replace(/[\t\r\n]/g, '')
        .trim()
      if (!content.replace(/[\u200B\u2800]/g, '')) return
      const anchor = a['text-anchor'] ?? 'start'
      // Internal engraving holds the font measurer fixed. Cache only a leaf's
      // local rectangle, checking every editable input; ancestor transforms
      // remain live. Public readers still observe changing font measurers.
      const cached = this.borrowImmutableInk && leaf ? this.leafTextInk.get(node) : undefined
      if (cached && cached.content === content && cached.size === size && cached.bold === style.bold
        && cached.italic === style.italic && cached.x === a.x && cached.y === a.y && cached.anchor === anchor) boxes = cached.boxes
      else {
        const metrics = this.measure(content, size, style.bold, style.italic)
        const x = num('x') - (anchor === 'middle' ? metrics.width / 2 : anchor === 'end' ? metrics.width : 0), y = num('y')
        boxes = [{ left: x + metrics.left, right: x + metrics.right, top: y - metrics.ascent, bottom: y + metrics.descent }]
        if (this.borrowImmutableInk && leaf) this.leafTextInk.set(node, { content, size, bold: style.bold, italic: style.italic,
          x: a.x, y: a.y, anchor, boxes: boxes as Ink[] })
      }
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
      for (const child of node.geometryChildren?.() ?? node.children)
        if (typeof child !== 'string' && !omit?.(child)) this.collect(child, m, style, omit, result, secondary && !secondary.omit(child) ? secondary : undefined, borrow, selection)
      return
    }
    for (const b of boxes) { const placed = transform({ left: b.left - half, right: b.right + half, top: b.top - half, bottom: b.bottom + half }, m); result.push(placed); secondary?.result.push(placed) }
  }

  ink(node: XmlNode): Ink {
    const bounds = new InkBounds()
    this.collect(node, identity, { size: scoreLayoutConfig.staff.text / scoreLayoutConfig.staff.engine.scale, bold: false, italic: false }, undefined, bounds, undefined, true)
    return bounds.value()
  }
}
