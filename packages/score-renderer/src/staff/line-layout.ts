import { planScoreLines, type LineCandidate } from '@m3n/notation'
import {
  findAll,
  nodes,
  element,
  hasClass,
  readXml,
  xml,
  type XmlNode,
  textContent,
  type MeasureText,
} from './layout-svg.js'
import { measureWeight, measureBeats, splitMeasure } from './measure-fragments.js'

export const STAFF_SCALE = 0.038
export type MeasuredStaffMeasure = {
  id: string
  body: number
  head: number
  weight: number
  force: boolean
  section: boolean
  fragment: boolean
  inset: number
}
export type StaffLine = { measures: MeasuredStaffMeasure[]; minimum: number; target: number; weight: number }
type Engrave = (mei: string, options: Record<string, unknown>) => string[]
export function staffWidths(markup: string[]): Map<string, number> {
  const result = new Map<string, number>()
  for (const source of markup)
    for (const measure of findAll(readXml(source), (n) => hasClass(n, 'measure'))) {
      const staff = nodes(measure).find((n) => hasClass(n, 'staff'))
      const path = staff && nodes(staff).find((n) => n.tagName === 'path')
      const coords = path?.attributes.d?.match(/[-+]?\d*\.?\d+/g)?.map(Number)
      if (coords && coords.length >= 4) result.set(measure.attributes.id!, coords[2]! - coords[0]!)
    }
  return result
}
function forceEveryMeasure(root: XmlNode) {
  for (const node of nodes(root)) forceEveryMeasure(node)
  root.children = root.children.flatMap((child) =>
    typeof child !== 'string' && child.tagName === 'measure' ? [element('sb'), child] : [child],
  )
}
function infos(root: XmlNode) {
  let force = false
  const result: { node: XmlNode; force: boolean; section: boolean }[] = []
  const visit = (node: XmlNode) => {
    if (node.tagName === 'sb') {
      force = true
      return
    }
    if (node.tagName === 'measure') {
      const section = Boolean(findAll(node, (n) => n.tagName === 'reh').length)
      result.push({ node, force, section })
      force = false
      return
    }
    nodes(node).forEach(visit)
  }
  visit(root)
  return result
}
function assignLines(root: XmlNode, starts: Set<string>, targets: Map<string, number>) {
  root.children = root.children.flatMap<XmlNode | string>((child) => {
    if (typeof child === 'string') return [child]
    if (child.tagName === 'sb') return []
    if (child.tagName === 'measure') {
      const id = child.attributes['xml:id']!
      child.attributes.type = `m3n-width-${targets.get(id)!.toFixed(3)}`
      return starts.has(id) ? [element('sb'), child] : [child]
    }
    assignLines(child, starts, targets)
    return [child]
  })
}
/** Engine measurements include the actual clef/key/meter cost at each possible
 * line start; the shared planner scores entire hard-break regions. */
export function planStaffLines(
  source: string,
  width: number,
  equal: boolean,
  engrave: Engrave,
  measureText: MeasureText,
  adjustments: ReadonlyMap<string, number> = new Map(),
): { mei: string; lines: StaffLine[]; targets: Map<string, number> } {
  let root = readXml(source),
    written = infos(root)
  for (const label of findAll(root, (n) => n.tagName === 'reh' && n.attributes.type === 'm3n-section'))
    if (measureText(textContent(label), 16, true).width + 21 > width / 2)
      label.attributes.type = 'm3n-section-heading'
  const options = { breaks: 'none', noJustification: true, adjustPageWidth: true }
  const available = (width - 4) / STAFF_SCALE
  let body = new Map<string, number>(),
    heads = new Map<string, number>()
  for (let pass = 0; pass < 12; pass++) {
    body = staffWidths(engrave(xml(root), options))
    const solo = readXml(xml(root))
    forceEveryMeasure(solo)
    heads = staffWidths(engrave(xml(solo), { breaks: 'line', noJustification: true, adjustPageWidth: true }))
    let changed = false
    for (const item of written) {
      const id = item.node.attributes['xml:id']!
      const min = (heads.get(id) ?? 0) + (adjustments.get(id) ?? 0)
      if (min <= available) continue
      const beats = measureBeats(item.node)
      const fragments = splitMeasure(item.node, Math.max(0.125, (beats * Math.max(100, available - 1800)) / min))
      if (fragments.length <= 1) continue
      const replace = (parent: XmlNode) => {
        parent.children = parent.children.flatMap((child) => (child === item.node ? fragments : [child]))
        nodes(parent).forEach(replace)
      }
      replace(root)
      changed = true
    }
    if (!changed) break
    written = infos(root)
    if (pass === 11) throw new Error('五线谱超宽小节无法在安全断点完成分行。')
  }
  const measured: MeasuredStaffMeasure[] = written.map(({ node, force, section }) => {
    const id = node.attributes['xml:id']!,
      b = body.get(id),
      s = heads.get(id)
    if (b === undefined || s === undefined) throw new Error(`五线谱小节测量缺失：${id}`)
    return {
      id,
      body: b + (adjustments.get(id) ?? 0),
      head:
        Math.max(0, s - b) +
        (section && findAll(node, (n) => n.tagName === 'reh' && n.attributes.type === 'm3n-section').length
          ? (measureText(textContent(findAll(node, (n) => n.tagName === 'reh')[0]!), 16, true).width + 21) / STAFF_SCALE
          : 0),
      inset:
        section && findAll(node, (n) => n.tagName === 'reh' && n.attributes.type === 'm3n-section').length
          ? (measureText(textContent(findAll(node, (n) => n.tagName === 'reh')[0]!), 16, true).width + 21) / STAFF_SCALE
          : 0,
      weight: measureWeight(node),
      force,
      section,
      fragment: id.includes('-fragment'),
    }
  })
  const lines: StaffLine[] = []
  for (let begin = 0; begin < measured.length;) {
    let end = begin + 1
    while (end < measured.length && !measured[end]!.force) end++
    const group = measured.slice(begin, end),
      candidates: LineCandidate[][] = group.map(() => [])
    for (let start = 0; start < group.length; start++) {
      let sum = 0,
        max = 0
      for (let stop = start; stop < group.length; stop++) {
        const item = group[stop]!
        sum += item.body
        max = Math.max(max, item.body + (stop === start ? item.head - item.inset : 0))
        const minimum = equal ? max * (stop - start + 1) + group[start]!.inset : sum + group[start]!.head
        if (minimum > available && stop > start) break
        candidates[start]!.push({ end: stop + 1, density: minimum / available })
      }
    }
    let start = 0
    for (const stop of planScoreLines(candidates, { relaxLastLine: end === measured.length })) {
      const members = group.slice(start, stop),
        minimum = equal
          ? Math.max(...members.map((m, i) => m.body + (i ? 0 : m.head - m.inset))) * members.length + members[0]!.inset
          : members.reduce((n, m) => n + m.body, 0) + members[0]!.head
      lines.push({
        measures: members,
        minimum,
        target: Math.max(available, minimum),
        weight: members.reduce((n, m) => n + m.weight, 0),
      })
      start = stop
    }
    begin = end
  }
  const last = lines.at(-1),
    previous = lines.at(-2)
  if (
    last &&
    previous &&
    !last.measures[0]!.section &&
    /^m3n-measure-\d+/.exec(last.measures[0]!.id)?.[0] === /^m3n-measure-\d+/.exec(previous.measures[0]!.id)?.[0]
  ) {
    const inherited = equal
      ? Math.max(last.minimum, (previous.target / previous.measures.length) * last.measures.length)
      : last.minimum + (previous.weight ? ((previous.target - previous.minimum) / previous.weight) * last.weight : 0)
    if (inherited <= available * 0.6) last.target = inherited
  }
  const targets = new Map<string, number>(),
    starts = new Set<string>()
  for (const line of lines) {
    starts.add(line.measures[0]!.id)
    for (const [i, item] of line.measures.entries())
      targets.set(
        item.id,
        equal
          ? (line.target - line.measures[0]!.inset) / line.measures.length
          : item.body +
              (i ? 0 : item.head - item.inset) +
              (line.target - line.minimum) * (line.weight ? item.weight / line.weight : 0),
      )
  }
  assignLines(root, starts, targets)
  return { mei: xml(root), lines, targets }
}
