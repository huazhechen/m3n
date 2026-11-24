import { SVGContext } from 'vexflow/bravura'
import { element, nodes, readXml, type XmlNode } from './layout-svg.js'
import { StaffPathInk } from './staff-path-ink.js'

/** The SVGContext node sink for the pinned VexFlow 4.2.5 drawing API.
 * Keep its paths, rounding and attribute policy; collect XML nodes directly. */
class StaffSvgNode {
  readonly data: XmlNode
  readonly style: Record<string, string> = {}
  private parent?: StaffSvgNode
  constructor(readonly nodeName: string, private readonly ink?: (d: string) => XmlNode['pathInk']) { this.data = element(nodeName) }
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
    if (name === 'd') this.data.pathInk = this.ink?.(text)
  }
  setAttributeNS(namespace: string | null, name: string, value: string | number) {
    if (namespace !== null) throw new Error('五线谱绘图使用了未知的属性命名空间。')
    this.setAttribute(name, value)
  }
  set textContent(value: string) { this.data.children = value ? [value] : [] }
  detach() { this.parent?.removeChild(this) }
}

export class StaffSvgContext extends SVGContext {
  private textContext?: SVGContext
  private pathGeometry?: StaffPathInk
  private recordedPath = ''
  constructor() { super(new StaffSvgNode('div') as unknown as HTMLElement) }
  override create(tag: 'g'): SVGGElement
  override create(tag: 'path'): SVGPathElement
  override create(tag: 'rect'): SVGRectElement
  override create(tag: 'svg'): SVGSVGElement
  override create(tag: 'text'): SVGTextElement
  override create(tag: string): SVGElement
  override create(tag: string): SVGElement {
    return new StaffSvgNode(tag, tag === 'path' ? d => {
      if (this.pathGeometry && d && d === this.recordedPath && d === this.path)
        return { d, boxes: this.pathGeometry.ink() }
    } : undefined) as unknown as SVGElement
  }
  override beginPath(): this {
    super.beginPath()
    this.pathGeometry = new StaffPathInk()
    this.recordedPath = this.path
    return this
  }
  private activePath() {
    if (this.path !== this.recordedPath) this.pathGeometry = undefined
    return this.pathGeometry
  }
  // Adding zero normalizes -0 just as SVG's number-to-string conversion does.
  override moveTo(x: number, y: number): this {
    this.activePath()?.move(this.round(x) + 0, this.round(y) + 0)
    super.moveTo(x, y); this.recordedPath = this.path
    return this
  }
  override lineTo(x: number, y: number): this {
    this.activePath()?.line(this.round(x) + 0, this.round(y) + 0)
    super.lineTo(x, y); this.recordedPath = this.path
    return this
  }
  override bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): this {
    this.activePath()?.cubic(this.round(x1) + 0, this.round(y1) + 0, this.round(x2) + 0, this.round(y2) + 0, this.round(x) + 0, this.round(y) + 0)
    super.bezierCurveTo(x1, y1, x2, y2, x, y); this.recordedPath = this.path
    return this
  }
  override quadraticCurveTo(x1: number, y1: number, x: number, y: number): this {
    this.activePath()?.quadratic(this.round(x1) + 0, this.round(y1) + 0, this.round(x) + 0, this.round(y) + 0)
    super.quadraticCurveTo(x1, y1, x, y); this.recordedPath = this.path
    return this
  }
  override closePath(): this {
    this.activePath()?.close()
    super.closePath(); this.recordedPath = this.path
    return this
  }
  override arc(x: number, y: number, radius: number, start: number, end: number, counterclockwise: boolean): this {
    // SVGContext emits A commands directly. Keep the general parser for arcs.
    this.pathGeometry = undefined
    super.arc(x, y, radius, start, end, counterclockwise)
    this.recordedPath = this.path
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
