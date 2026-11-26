import { lastLineWidth, scoreLayoutConfig, createScoreHorizontalReference } from '@m3n/numbered-notation'
import { planScoreLines, type LineCandidate } from '@m3n/notation'
import { createStaffPreparation, staffMinimumAtSpacing, STAFF_SCALE, type StaffMeasureMetrics, type StaffPreparation } from './staff-engine.js'
import { splitStaffMeasure, type StaffDocument, type StaffMeasure } from './staff-document.js'
import type { MeasureText } from './layout-svg.js'

/** One notation-independent reading chain per task; physical staff ink remains a separate floor. */
export function createStaffHorizontalReference(document: StaffDocument, settings: { transpose?: number; includeBass?: boolean; tempoScale?: number } = {}) {
  const reference = createScoreHorizontalReference(document.score, { includeBass: document.hasBass, ...settings })
  const offsets = new Map(document.measures.map(measure => [measure.id, measure.beatOffset ?? 0]))
  return Object.assign((members: StaffMeasure[], spacing: number, equal: boolean) => reference(members.map(member => {
    const id = member.id.replace(/-fragment-.*/, '')
    const start = member.fragment ? (member.beatOffset ?? 0) - (offsets.get(id) ?? 0) : 0
    return { id, start, end: member.fragment ? start + Math.max(0,
      ...[member.melody, member.bass].flatMap(lane => lane.map(event => event.onset + event.beats))) : undefined }
  }), scoreLayoutConfig.numbered.minimumNoteGap + (spacing - .25) * 48, equal), { releasePreparation: reference.releasePreparation })
}
export { STAFF_SCALE }
export type MeasuredStaffMeasure = { id: string; measure: StaffMeasure; body: number; reading: number; head: number; weight: number; inset: number }
export type StaffLine = { measures: MeasuredStaffMeasure[]; minimum: number; reading?: number; target: number; weight: number }
type StaffMeasureDescription = { weight: number; beats: number; labelWidth: number }
export type StaffMeasureMinimum = ((measure: StaffMeasure, first: boolean, spacing: number) => number) & { reference?: ((measures: StaffMeasure[], spacing: number, equal: boolean) => number | undefined) & { releasePreparation?: () => void }; preferred?: (measure: StaffMeasure, first: boolean, spacing: number) => number; split?: (measure: StaffMeasure, maximumBeats: number) => StaffMeasure[]; describe?: (measure: StaffMeasure) => StaffMeasureDescription }
/** Fixed minima and private drawing models are prepared once in this task. */
export function createStaffMeasureMinimum(hasBass: boolean, measureText: MeasureText, preparation: StaffPreparation = createStaffPreparation()): StaffMeasureMinimum {
  const metrics = new WeakMap<StaffMeasure, Array<StaffMeasureMetrics | undefined>>()
  const minimum: StaffMeasureMinimum = (measure, first, spacing) => {
    let pair = metrics.get(measure)
    if (!pair) { pair = []; metrics.set(measure, pair) }
    const index = first ? 1 : 0
    let fixed = pair[index]
    if (!fixed) {
      fixed = pair[index] = preparation.measure(measure, first, hasBass, measureText).metrics
    }
    return staffMinimumAtSpacing(fixed, spacing)
  }
  minimum.preferred = (measure, first, spacing) => {
    minimum(measure, first, spacing)
    return staffMinimumAtSpacing(metrics.get(measure)![first ? 1 : 0]!, spacing, true)
  }
  const descriptions = new WeakMap<StaffMeasure, StaffMeasureDescription>()
  minimum.describe = measure => {
    let description = descriptions.get(measure)
    if (!description) { description = describeStaffMeasure(measure, measureText); descriptions.set(measure, description) }
    return description
  }
  const splits = new WeakMap<StaffMeasure, Map<string, StaffMeasure[]>>()
  minimum.split = (measure, maximumBeats) => {
    const result = splitStaffMeasure(measure, maximumBeats)
    if (result.length < 2) return result
    let variants = splits.get(measure)
    if (!variants) { variants = new Map(); splits.set(measure, variants) }
    // The original measure fixes the end, event content, key and source. Only
    // common cut boundaries determine its immutable fragment descriptors.
    const key = result.map(fragment => fragment.beatOffset).join(':')
    const saved = variants.get(key)
    if (saved) return saved
    variants.set(key, result)
    return result
  }
  return minimum
}
function describeStaffMeasure(measure: StaffMeasure, measureText: MeasureText): StaffMeasureDescription {
  const label = measure.melody[0]?.event
  return {
    labelWidth: label?.sectionLabel ? measureText(label.sectionLabel, scoreLayoutConfig.staff.annotation, true).width + scoreLayoutConfig.staff.sectionLabelInset : 0,
    weight: Math.max(...[measure.melody, measure.bass].map(lane => lane.reduce((n, e) => n + Math.sqrt(e.beats), 0)), 1),
    beats: Math.max(...[measure.melody, measure.bass].map(lane => lane.reduce((n, e) => n + e.beats, 0))),
  }
}
export function planStaffLines(document: StaffDocument, width: number, equal: boolean, measureText: MeasureText, spacing: number,
  suppliedMinimum?: StaffMeasureMinimum): StaffLine[] {
  const minimum = suppliedMinimum ?? createStaffMeasureMinimum(document.hasBass, measureText)
  if (!suppliedMinimum) minimum.reference = createStaffHorizontalReference(document)
  const available = (width - scoreLayoutConfig.staff.contentEdgeInset) / STAFF_SCALE
  const measured: MeasuredStaffMeasure[] = []
  const sharedWidth = (members: MeasuredStaffMeasure[]) => {
    const width = minimum.reference?.(members.map(member => member.measure), spacing, equal)
    return width === undefined ? undefined : width / STAFF_SCALE
  }
  const measureOne = (measure: StaffMeasure): MeasuredStaffMeasure => {
    const body = minimum(measure, false, spacing)
    const solo = minimum(measure, true, spacing)
    const label = measure.melody[0]?.event
    const { labelWidth, weight } = minimum.describe?.(measure) ?? describeStaffMeasure(measure, measureText)
    const inset = labelWidth && !label?.sectionLabelBreakAfter && labelWidth <= width / 2 ? labelWidth / STAFF_SCALE : 0
    return { id: measure.id, measure, body, reading: minimum.preferred?.(measure, false, spacing) ?? body, head: solo - body + inset, inset, weight }
  }
  const visit = (measure: StaffMeasure, depth = 0) => {
    const item = measureOne(measure)
    const occupied = Math.max(item.body + item.head, sharedWidth([item]) ?? 0)
    if (occupied > available && depth < 10) {
      const { beats } = minimum.describe?.(measure) ?? describeStaffMeasure(measure, measureText)
      const fragments = (minimum.split ?? splitStaffMeasure)(measure, beats * Math.max(0.1, (available - item.head - scoreLayoutConfig.staff.engine.fragmentSafetyInset) / Math.max(item.body, occupied - item.head)) * 0.85)
      if (fragments.length > 1) { fragments.forEach(f => visit(f, depth + 1)); return }
      if (item.body + item.head > available) throw new Error(`单个五线谱事件无法放入当前版宽：${measure.id}`)
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
      ? Math.max(...members.map(m => m.body)) * members.length + members[0]!.head
      : members.reduce((n, m) => n + m.body, 0) + members[0]!.head
    const candidates: LineCandidate[][] = group.map((_, start) => {
      const result: LineCandidate[] = []
      let sum = 0, reading = 0, widest = -Infinity
      for (let stop = start + 1; stop <= group.length; stop++) {
        const member = group[stop - 1]!
        sum += member.body
        reading += member.reading
        widest = Math.max(widest, member.body)
        const minimum = equal ? widest * (stop - start) + group[start]!.head : sum + group[start]!.head
        // The shared reference can only increase this minimum. An overflowing
        // multi-measure span is rejected regardless of its reference width.
        if (minimum > available && stop > start + 1) break
        const reference = sharedWidth(group.slice(start, stop))
        const occupied = Math.max(minimum, reference ?? 0)
        if (occupied > available && stop > start + 1) break
        result.push({ end: stop, density: occupied / available,
          readingDensity: reference === undefined ? Math.max(minimum, reading + group[start]!.head) / available : occupied / available })
      }
      return result
    })
    let start = 0
    for (const stop of planScoreLines(candidates)) {
      const members = group.slice(start, stop), minimum = minimumFor(members)
      lines.push({ measures: members, minimum, reading: Math.max(minimum, sharedWidth(members) ?? 0), target: Math.max(available, minimum), weight: members.reduce((n, m) => n + m.weight, 0) })
      start = stop
    }
    begin = end
  }
  const last = lines.at(-1), previous = lines.at(-2)
  if (last && previous) {
    const inherited = equal ? Math.max(last.minimum, (previous.target - previous.measures[0]!.head) / previous.measures.length * last.measures.length + last.measures[0]!.head)
      : last.minimum + (previous.weight > 0 ? Math.max(0, previous.target - previous.minimum) / previous.weight : 0) * last.weight
    last.target = lastLineWidth(Math.max(last.minimum, last.reading ?? 0), inherited, available, equal ? 0 : last.minimum)
  }
  return lines
}
