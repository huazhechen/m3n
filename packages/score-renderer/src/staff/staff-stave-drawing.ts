import { Barline, Flow, StaveModifierPosition, type Stave, type StaveModifier, type SVGContext } from 'vexflow/bravura'
import { element, nodes, type Ink, type XmlNode } from './layout-svg.js'
import { prepareStaffNoteDrawing, type StaffNoteDrawing } from './staff-note-drawing.js'
import { captureStaffDrawing, StaffSvgContext } from './staff-svg-context.js'
import type { StaffVexPreparation } from './vexflow-engine.js'

const drawings = new WeakMap<StaffVexPreparation, WeakMap<StaveModifier, StaffNoteDrawing | null>>()
/** Stave rules vary only at their endpoints; clef/key/meter geometry is fixed
 * within the prepared model. Keep actual modifiers for formatting/anchors. */
export function drawStaffStave(stave: Stave, context: SVGContext, preparation: StaffVexPreparation, normalize: (node: XmlNode) => void): XmlNode[] {
  stave.setContext(context)
  stave.format()
  const result: XmlNode[] = []
  for (let i = 0; i < 5; i++) {
    const y = stave.getYForLine(i)
    result.push(new StaffRule(stave.getX(), stave.getX() + stave.getWidth(), y))
  }
  let templates = drawings.get(preparation)
  if (!templates) { templates = new WeakMap(); drawings.set(preparation, templates) }
  for (const [index, modifier] of stave.getModifiers().entries()) {
    if (modifier instanceof Barline && !modifier.getStyle()) {
      const type = modifier.getType()
      if ([1, 2, 3, 7].includes(type)) {
        modifier.setRendered()
        const x = modifier.getX(), top = stave.getTopLineTopY(), height = stave.getBottomLineBottomY() - top
        if (type === 2) result.push(new BarRectangle(x - 3, top, 1, height))
        if (type === 3) {
          result.push(new BarRectangle(x - 5, top, 1, height), new BarRectangle(x - 2, top, 3, height))
        } else if (type !== 7) result.push(new BarRectangle(x, top, 1, height))
        continue
      }
    }
    const draw = (sink: SVGContext) => {
      stave.setContext(sink)
      modifier.applyStyle(sink)
      modifier.draw(stave, stave.getModifierXShift(index))
      modifier.restoreStyle(sink)
    }
    if (modifier instanceof Barline || modifier.getPosition() !== StaveModifierPosition.BEGIN) {
      const output = captureStaffDrawing(context, () => draw(context)); output.forEach(normalize); result.push(...output)
      continue
    }
    let template = templates.get(modifier)
    if (template === undefined) {
      const x = stave.getX(), y = stave.getY()
      const recording = new StaffSvgContext(preparation.glyphs, true)
      try {
        stave.setX(0).setY(0); stave.format()
        const output = captureStaffDrawing(recording, () => draw(recording))
        output.forEach(normalize)
        const flatten = (items: XmlNode[]): XmlNode[] => items.flatMap(node => node.tagName === 'g' && !node.attributes.transform ? flatten(nodes(node)) : [node])
        template = prepareStaffNoteDrawing(flatten(output)) ?? null
        templates.set(modifier, template)
      } finally { stave.setX(x).setY(y); stave.format(); stave.setContext(context) }
    }
    if (template) result.push(...template.place(stave.getX(), stave.getY(), false))
    else {
      const output = captureStaffDrawing(context, () => draw(context)); output.forEach(normalize); result.push(...output)
    }
  }
  return result
}

/** Staff rules need only two rounded endpoints. Keep the path attributes lazy
 * while leaving each rule directly addressable by core/heading geometry. */
class StaffRule implements XmlNode {
  readonly tagName = 'path'
  readonly attributes: Record<string, string> = {}
  readonly children: Array<XmlNode | string> = []
  readonly numericInk: Ink[]
  private readonly left: number
  private readonly right: number
  private readonly y: number
  constructor(left: number, right: number, y: number) {
    const precision = 10 ** Flow.RENDER_PRECISION_PLACES
    this.left = Math.round(left * precision) / precision + 0
    this.right = Math.round(right * precision) / precision + 0
    this.y = Math.round(y * precision) / precision + 0
    this.numericInk = [{ left: Math.min(this.left, this.right) - 0.5, right: Math.max(this.left, this.right) + 0.5,
      top: this.y - 0.5, bottom: this.y + 0.5 }]
  }
  renderNodes(): XmlNode[] { return [element('path', { fill: 'none', d: `M${this.left} ${this.y}L${this.right} ${this.y}`,
    stroke: '#000', 'stroke-width': '1', ...this.attributes })] }
}

class BarRectangle implements XmlNode {
  readonly tagName = 'rect'
  readonly attributes: Record<string, string> = {}
  readonly children: Array<XmlNode | string> = []
  readonly numericInk: Ink[]
  private readonly x: number
  private readonly y: number
  private readonly width: number
  private readonly height: number
  constructor(x: number, y: number, width: number, height: number) {
    const precision = 10 ** Flow.RENDER_PRECISION_PLACES
    this.x = Math.round(x * precision) / precision + 0
    this.y = Math.round(y * precision) / precision + 0
    this.width = Math.round(width * precision) / precision + 0
    this.height = Math.round(height * precision) / precision + 0
    this.numericInk = [{ left: this.x, right: this.x + this.width, top: this.y, bottom: this.y + this.height }]
  }
  renderNodes(): XmlNode[] {
    const attributes: Record<string, string> = {}
    // SVGContext omits numeric zero attributes and inherits the black fill.
    if (this.x) attributes.x = String(this.x)
    if (this.y) attributes.y = String(this.y)
    if (this.width) attributes.width = String(this.width)
    if (this.height) attributes.height = String(this.height)
    attributes.stroke = 'none'
    return [element('rect', { ...attributes, ...this.attributes })]
  }
}
