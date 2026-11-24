import { planScoreLines, type LineCandidate } from '@m3n/notation'
import { createVexMeasure, staffMinimumAtSpacing, STAFF_SCALE, type StaffMeasureMetrics, type StaffVexPreparation } from './vexflow-engine.js'
import { splitStaffMeasure, type StaffDocument, type StaffMeasure } from './staff-document.js'
import type { MeasureText } from './layout-svg.js'
export { STAFF_SCALE }
export type MeasuredStaffMeasure = { id: string; measure: StaffMeasure; body: number; head: number; weight: number; inset: number }
export type StaffLine = { measures: MeasuredStaffMeasure[]; minimum: number; target: number; weight: number }
export type StaffMeasureMinimum = (measure: StaffMeasure, first: boolean, spacing: number) => number
/** Only immutable minima are shared; VexFlow's mutable drawing objects are discarded. */
export function createStaffMeasureMinimum(hasBass: boolean, measureText: MeasureText, preparation?: StaffVexPreparation): StaffMeasureMinimum {
  const metrics = new WeakMap<StaffMeasure, Array<StaffMeasureMetrics | undefined>>()
  return (measure, first, spacing) => {
    let pair = metrics.get(measure)
    if (!pair) { pair = []; metrics.set(measure, pair) }
    const index = first ? 1 : 0
    const fixed = pair[index] ?? (pair[index] = createVexMeasure(measure, first, hasBass, measureText, spacing, undefined, preparation).metrics)
    return staffMinimumAtSpacing(fixed, spacing)
  }
}
export function planStaffLines(document: StaffDocument, width: number, equal: boolean, measureText: MeasureText, spacing: number,
  minimum: StaffMeasureMinimum = createStaffMeasureMinimum(document.hasBass, measureText)): StaffLine[] {
  const available = (width - 4) / STAFF_SCALE
  const measured: MeasuredStaffMeasure[] = []
  const measureOne = (measure: StaffMeasure): MeasuredStaffMeasure => {
    const body = minimum(measure, false, spacing)
    const solo = minimum(measure, true, spacing)
    const label = measure.melody[0]?.event
    const labelWidth = label?.sectionLabel ? measureText(label.sectionLabel, 16, true).width + 21 : 0
    const inset = labelWidth && !label?.sectionLabelBreakAfter && labelWidth <= width / 2 ? labelWidth / STAFF_SCALE : 0
    const weight = Math.max(...[measure.melody, measure.bass].map(lane => lane.reduce((n, e) => n + Math.sqrt(e.beats), 0)), 1)
    return { id: measure.id, measure, body, head: solo - body + inset, inset, weight }
  }
  const visit = (measure: StaffMeasure, depth = 0) => {
    const item = measureOne(measure)
    if (item.body + item.head > available && depth < 10) {
      const beats = Math.max(...[measure.melody, measure.bass].map(l => l.reduce((n, e) => n + e.beats, 0)))
      const fragments = splitStaffMeasure(measure, beats * Math.max(0.1, (available - item.head - 20) / item.body) * 0.85)
      if (fragments.length > 1) { fragments.forEach(f => visit(f, depth + 1)); return }
      throw new Error(`单个五线谱事件无法放入当前版宽：${measure.id}`)
    }
    measured.push(item)
  }
  document.measures.forEach(m => visit(m))
  const lines: StaffLine[] = []
  for (let begin = 0; begin < measured.length;) {
    let end = begin + 1
    while (end < measured.length && !measured[end]!.measure.force) end++
    const group = measured.slice(begin, end)
    const minimumFor = (members: MeasuredStaffMeasure[]) => equal
      ? Math.max(...members.map((m, i) => m.body + (i ? 0 : m.head - m.inset))) * members.length + members[0]!.inset
      : members.reduce((n, m) => n + m.body, 0) + members[0]!.head
    const candidates: LineCandidate[][] = group.map((_, start) => {
      const result: LineCandidate[] = []
      for (let stop = start + 1; stop <= group.length; stop++) {
        const minimum = minimumFor(group.slice(start, stop))
        if (minimum > available && stop > start + 1) break
        result.push({ end: stop, density: minimum / available })
      }
      return result
    })
    let start = 0
    for (const stop of planScoreLines(candidates)) {
      const members = group.slice(start, stop), minimum = minimumFor(members)
      lines.push({ measures: members, minimum, target: Math.max(available, minimum), weight: members.reduce((n, m) => n + m.weight, 0) })
      start = stop
    }
    begin = end
  }
  const last = lines.at(-1), previous = lines.at(-2)
  if (last && previous) {
    const inherited = equal ? Math.max(last.minimum, previous.target / previous.measures.length * last.measures.length)
      : last.minimum + (previous.target - previous.minimum) / previous.weight * last.weight
    if (inherited <= available * 0.6) last.target = inherited
  }
  return lines
}
