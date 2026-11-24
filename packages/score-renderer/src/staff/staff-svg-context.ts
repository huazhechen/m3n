import { SVGContext } from 'vexflow/bravura'
import { element, nodes, readXml, type XmlNode } from './layout-svg.js'

/** The SVGContext node sink for the pinned VexFlow 4.2.5 drawing API.
 * Keep its paths, rounding and attribute policy; collect XML nodes directly. */
class StaffSvgNode {
  readonly data: XmlNode
  readonly style: Record<string, string> = {}
  private parent?: StaffSvgNode
  constructor(readonly nodeName: string) { this.data = element(nodeName) }
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
  setAttribute(name: string, value: string | number) { this.data.attributes[name] = String(value) }
  setAttributeNS(namespace: string | null, name: string, value: string | number) {
    if (namespace !== null) throw new Error('五线谱绘图使用了未知的属性命名空间。')
    this.setAttribute(name, value)
  }
  set textContent(value: string) { this.data.children = value ? [value] : [] }
  detach() { this.parent?.removeChild(this) }
}

export class StaffSvgContext extends SVGContext {
  private textContext?: SVGContext
  constructor() { super(new StaffSvgNode('div') as unknown as HTMLElement) }
  override create(tag: 'g'): SVGGElement
  override create(tag: 'path'): SVGPathElement
  override create(tag: 'rect'): SVGRectElement
  override create(tag: 'svg'): SVGSVGElement
  override create(tag: 'text'): SVGTextElement
  override create(tag: string): SVGElement
  override create(tag: string): SVGElement { return new StaffSvgNode(tag) as unknown as SVGElement }
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
