import { Glyph, SVGContext } from 'vexflow/bravura'
import { element, nodes, readXml, setNumericPath, type XmlNode } from './layout-svg.js'
import { StaffPathInk } from './staff-path-ink.js'
import { staffGlyphPrimitive, staffCommandPath, type StaffPathCommand, type StaffGlyphTemplates } from './staff-glyph-primitive.js'
export type { StaffGlyphTemplates } from './staff-glyph-primitive.js'

type Attributes = Parameters<SVGContext['applyAttributes']>[1]

/** The SVGContext node sink for the pinned VexFlow 4.2.5 drawing API.
 * Keep its paths, rounding and attribute policy; collect XML nodes directly. */
class StaffSvgNode {
  readonly data: XmlNode
  readonly style: Record<string, string> = {}
  private parent?: StaffSvgNode
  constructor(readonly nodeName: string, private readonly ink?: (node: XmlNode, d: string) => void) { this.data = element(nodeName) }
  appendChild(child: StaffSvgNode) {
    child.parent?.removeChild(child)
    this.data.children.push(child.data)
    child.parent = this
    return child
  }
  removeChild(child: StaffSvgNode) {
    const index = this.data.children.indexOf(child.data)
    if (index < 0) throw new Error('五线谱绘图节点不属于此父节点。')
    this.data.children.splice(index, 1)
    child.parent = undefined
    return child
  }
  setAttribute(name: string, value: string | number) {
    const text = String(value)
    this.data.attributes[name] = text
    if (name === 'd') this.ink?.(this.data, text)
  }
  setAttributeNS(namespace: string | null, name: string, value: string | number) {
    if (namespace !== null) throw new Error('五线谱绘图使用了未知的属性命名空间。')
    this.setAttribute(name, value)
  }
  set textContent(value: string) { this.data.children = value ? [value] : [] }
  detach() { this.parent?.removeChild(this) }
}

const renderGlyphOutline = Glyph.renderOutline
// A context-specific sink: ordinary VexFlow consumers keep their original API.
Glyph.renderOutline = (context, outline, scale, x, y) => {
  if (context instanceof StaffSvgContext && context.glyphs) context.drawGlyph(outline, scale, x, y)
  else renderGlyphOutline(context, outline, scale, x, y)
}

export class StaffSvgContext extends SVGContext {
  private textContext?: SVGContext
  private pathGeometry?: StaffPathInk
  private recordedPath = ''
  private commands?: StaffPathCommand[]
  private numericCommands?: StaffPathCommand[]
  private stringPath = ''
  private glyphPath?: ReturnType<typeof staffCommandPath>
  private numericSnapshot?: ReturnType<typeof staffCommandPath>
  constructor(readonly glyphs?: StaffGlyphTemplates, private readonly recording = false) {
    super(new StaffSvgNode('div') as unknown as HTMLElement)
    Object.defineProperty(this, 'path', { configurable: true, enumerable: true,
      get: () => this.numericCommands ? this.currentNumericPath().text() : this.glyphPath?.text() ?? this.stringPath,
      set: (value: string) => { this.numericCommands = undefined; this.glyphPath = undefined; this.numericSnapshot = undefined; this.stringPath = value },
    })
  }
  private currentNumericPath() { return this.numericSnapshot ??= staffCommandPath([...this.numericCommands!]) }
  drawGlyph(outline: number[], scale: number, x: number, y: number) {
    this.numericCommands = undefined
    const primitive = staffGlyphPrimitive(this.glyphs!, outline, scale, x, y)
    const path = new StaffSvgNode('path')
    this.applyAttributes(path as unknown as SVGPathElement, { ...this.attributes, stroke: 'none' })
    setNumericPath(path.data, primitive)
    this.glyphPath = primitive
    this.pen = { ...primitive.end }
    this.add(path as unknown as SVGPathElement)
  }
  override create(tag: 'g'): SVGGElement
  override create(tag: 'path'): SVGPathElement
  override create(tag: 'rect'): SVGRectElement
  override create(tag: 'svg'): SVGSVGElement
  override create(tag: 'text'): SVGTextElement
  override create(tag: string): SVGElement
  override create(tag: string): SVGElement {
    return new StaffSvgNode(tag, tag === 'path' ? (node, d) => {
      if (this.pathGeometry && d && d === this.recordedPath && d === this.path)
        node.pathInk = { d, boxes: this.pathGeometry.ink() }
      if (this.commands && d === this.path) setNumericPath(node, staffCommandPath([...this.commands]))
    } : undefined) as unknown as SVGElement
  }
  override beginPath(): this {
    super.beginPath()
    this.numericCommands = this.glyphs ? [] : undefined
    this.commands = this.recording ? [] : undefined
    this.pathGeometry = this.numericCommands ? undefined : new StaffPathInk()
    this.recordedPath = this.numericCommands ? '' : this.path
    return this
  }
  private activePath() {
    if (this.path !== this.recordedPath) this.pathGeometry = undefined
    return this.pathGeometry
  }
  // Adding zero normalizes -0 just as SVG's number-to-string conversion does.
  override moveTo(x: number, y: number): this {
    if (this.numericCommands) { this.numericCommands.push({ kind: 0, values: [x, y] }); this.numericSnapshot = undefined; this.pen.x = this.round(x); this.pen.y = this.round(y); return this }
    this.commands?.push({ kind: 0, values: [x, y] })
    this.activePath()?.move(this.round(x) + 0, this.round(y) + 0)
    super.moveTo(x, y); this.recordedPath = this.path
    return this
  }
  override lineTo(x: number, y: number): this {
    if (this.numericCommands) { this.numericCommands.push({ kind: 1, values: [x, y] }); this.numericSnapshot = undefined; this.pen.x = this.round(x); this.pen.y = this.round(y); return this }
    this.commands?.push({ kind: 1, values: [x, y] })
    this.activePath()?.line(this.round(x) + 0, this.round(y) + 0)
    super.lineTo(x, y); this.recordedPath = this.path
    return this
  }
  override bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): this {
    if (this.numericCommands) { this.numericCommands.push({ kind: 3, values: [x1, y1, x2, y2, x, y] }); this.numericSnapshot = undefined; this.pen.x = this.round(x); this.pen.y = this.round(y); return this }
    this.commands?.push({ kind: 3, values: [x1, y1, x2, y2, x, y] })
    this.activePath()?.cubic(this.round(x1) + 0, this.round(y1) + 0, this.round(x2) + 0, this.round(y2) + 0, this.round(x) + 0, this.round(y) + 0)
    super.bezierCurveTo(x1, y1, x2, y2, x, y); this.recordedPath = this.path
    return this
  }
  override quadraticCurveTo(x1: number, y1: number, x: number, y: number): this {
    if (this.numericCommands) { this.numericCommands.push({ kind: 2, values: [x1, y1, x, y] }); this.numericSnapshot = undefined; this.pen.x = this.round(x); this.pen.y = this.round(y); return this }
    this.commands?.push({ kind: 2, values: [x1, y1, x, y] })
    this.activePath()?.quadratic(this.round(x1) + 0, this.round(y1) + 0, this.round(x) + 0, this.round(y) + 0)
    super.quadraticCurveTo(x1, y1, x, y); this.recordedPath = this.path
    return this
  }
  override closePath(): this {
    if (this.numericCommands) { this.numericCommands.push({ kind: 4, values: [] }); this.numericSnapshot = undefined; return this }
    this.commands?.push({ kind: 4, values: [] })
    this.activePath()?.close()
    super.closePath(); this.recordedPath = this.path
    return this
  }
  override arc(x: number, y: number, radius: number, start: number, end: number, counterclockwise: boolean): this {
    if (this.numericCommands) {
      if (!this.numericCommands.length && start === 0 && end === Math.PI * 2 && !counterclockwise) {
        this.numericCommands.push({ kind: 5, values: [x, y, radius] })
        this.pen = { x: this.round(x + radius), y: this.round(y) }
        return this
      }
      this.path = staffCommandPath(this.numericCommands).text()
      this.numericCommands = undefined
    }
    // SVGContext emits A commands directly. Keep the general parser for arcs.
    this.pathGeometry = undefined
    if (this.commands?.length === 0 && start === 0 && end === Math.PI * 2 && !counterclockwise)
      this.commands.push({ kind: 5, values: [x, y, radius] })
    else this.commands = undefined
    super.arc(x, y, radius, start, end, counterclockwise)
    this.recordedPath = this.path
    return this
  }
  private addNumericPath(attributes: Attributes): void {
    const path = new StaffSvgNode('path')
    this.applyAttributes(path as unknown as SVGPathElement, attributes)
    setNumericPath(path.data, this.currentNumericPath())
    this.add(path as unknown as SVGPathElement)
  }
  private materializePath(): void {
    // Writing the serialized path switches shadow drawing to the native sink.
    const serialized = this.path
    this.path = serialized
  }
  override fill(attributes?: Attributes): this {
    if (this.numericCommands && Number(this.shadow_attributes.width ?? 0) > 0) this.materializePath()
    if (!this.numericCommands) return super.fill(attributes)
    this.addNumericPath(attributes ?? { ...this.attributes, stroke: 'none' })
    return this
  }
  override stroke(): this {
    if (this.numericCommands && Number(this.shadow_attributes.width ?? 0) > 0) this.materializePath()
    if (!this.numericCommands) return super.stroke()
    this.addNumericPath({ ...this.attributes, fill: 'none', 'stroke-width': this.lineWidth })
    return this
  }
  override measureText(text: string) {
    // Retain VexFlow's native text measurement and font cache, if requested.
    this.textContext ??= new SVGContext(document.createElement('div'))
    this.textContext.attributes = this.attributes
    return this.textContext.measureText(text)
  }
}

export function captureStaffDrawing(context: SVGContext, draw: () => void): XmlNode[] {
  const group = context.openGroup()
  try { draw() } finally { context.closeGroup() }
  if (context instanceof StaffSvgContext) {
    const collected = group as unknown as StaffSvgNode
    collected.detach()
    return nodes(collected.data)
  }
  // Preserve support for callers supplying an ordinary VexFlow SVGContext.
  return nodes(readXml(group.outerHTML))
}
