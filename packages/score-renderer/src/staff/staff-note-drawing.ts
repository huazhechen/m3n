import { element, nodes, setNumericPath, type Ink, type XmlNode } from './layout-svg.js'
import type { StaffNumericPath } from './staff-glyph-primitive.js'

const movable = /(?:^|\s)(?:reh|dir|harm|dynam|tempo|fing|ending|hairpin|octave|mNum|fermata|breath|trill|mordent|repeatMark|m3n-tuplet-label)(?:\s|$)/
type Path = { primitive: StaffNumericPath; half: number }
export type StaffNoteDrawing = { place(x: number, y: number, flatten: boolean): XmlNode[] }

/** Fixed local music keeps independent subpaths for exact internal avoidance. */
export function prepareStaffNoteDrawing(template: readonly XmlNode[]): StaffNoteDrawing | undefined {
  const paths: Path[] = []
  const scan = (node: XmlNode): boolean => {
    if (node.attributes.transform || movable.test(node.attributes.class ?? '')) return false
    if (node.tagName === 'path') {
      if (!node.numericPath) return false
      paths.push({ primitive: node.numericPath, half: node.attributes.stroke === 'none' ? 0 : parseFloat(node.attributes['stroke-width'] ?? '0') / 2 })
      return true
    }
    return node.tagName === 'g' && node.children.every(child => typeof child !== 'string' && scan(child))
  }
  return template.every(scan) ? new DrawingTemplate(template, paths) : undefined
}
class DrawingTemplate {
  private previous?: PlacedDrawing
  constructor(private readonly template: readonly XmlNode[], private readonly paths: readonly Path[]) {}
  place(x: number, y: number, flatten: boolean): XmlNode[] {
    const placed = new PlacedDrawing(this, this.paths, x, y, flatten, this.previous)
    this.previous = placed
    return [placed]
  }
  materialize(paths: readonly StaffNumericPath[], flatten: boolean): Array<XmlNode | string> {
    let index = 0
    const copy = (node: XmlNode): XmlNode => {
      const attributes: Record<string, string> = {}
      for (const key of Object.keys(node.attributes)) attributes[key] = key === 'd' ? '' : node.attributes[key]!
      const result = element(node.tagName, attributes, node.children.map(child => typeof child === 'string' ? child : copy(child)))
      if (node.numericPath) setNumericPath(result, paths[index++]!)
      return result
    }
    const output = this.template.map(copy)
    return flatten ? output.flatMap(node => node.tagName === 'g' && node.attributes.class === 'stavenote' ? nodes(node) : [node]) : output
  }
}
/** Shared methods avoid allocating rendering closures for every candidate note. */
class PlacedDrawing implements XmlNode {
  readonly tagName = 'g'
  readonly attributes = { class: 'm3n-note-ink' }
  readonly children: Array<XmlNode | string> = []
  readonly numericInk: Ink[]
  private readonly paths: StaffNumericPath[]
  private rendered?: Array<XmlNode | string>
  constructor(private readonly template: DrawingTemplate, paths: readonly Path[], private readonly x: number, private readonly y: number, private readonly flatten: boolean, previous?: PlacedDrawing) {
    if (previous && previous.x === x && previous.y === y) { this.numericInk = previous.numericInk; this.paths = previous.paths; return }
    this.numericInk = []; this.paths = []
    for (const { primitive, half } of paths) {
      const placed = primitive.place(x, y)
      this.paths.push(placed)
      for (const box of placed.boxes) this.numericInk.push({ left: box.left - half, right: box.right + half, top: box.top - half, bottom: box.bottom + half })
    }
  }
  renderNodes(): Array<XmlNode | string> { return this.rendered ??= this.template.materialize(this.paths, this.flatten) }
}
