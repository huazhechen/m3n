import { planScoreLinesGlobally, type ScoreLineCandidate, lastLineWidth, scoreLayoutConfig, prepareScoreStretch, mergeScoreStretch, distributeScoreStretchGroups, inheritScoreStretchWidth, type ScoreStretch } from '@m3n/numbered-notation/layout'
import { createStaffPreparation, staffMinimumAtSpacing, staffReadingSpacing, staffRhythmicSpacing, staffSpacingWeight, staffSpacingStretch, STAFF_SCALE, type StaffMeasureMetrics, type StaffPreparation } from './staff-engine.js'
import { splitStaffMeasure, type StaffDocument, type StaffMeasure } from './staff-document.js'
import type { MeasureText } from './layout-svg.js'

export { STAFF_SCALE }
export type MeasuredStaffMeasure = { id: string; measure: StaffMeasure; body: number; reading: number; head: number; weight: number; inset: number; stretch?: readonly [ScoreStretch, ScoreStretch] }
export type StaffLine = { measures: MeasuredStaffMeasure[]; minimum: number; reading?: number; localReadingPenalty?: number; target: number; weight: number; unitRhythmicGap?: number; rhythmicGaps?: readonly number[] }
type StaffMeasureDescription = { weight: number; beats: number; labelWidth: number }
export type StaffMeasureMinimum = ((measure: StaffMeasure, first: boolean, spacing: number) => number) & { preferred?: (measure: StaffMeasure, first: boolean, spacing: number) => number; localReading?: (measure: StaffMeasure, spacing: number, extra: number) => number; rhythmic?: (measure: StaffMeasure, first: boolean, spacing: number, extra: number) => { gap: number; weight: number; gaps: readonly number[] }; weight?: (measure: StaffMeasure) => number; split?: (measure: StaffMeasure, maximumBeats: number) => StaffMeasure[]; describe?: (measure: StaffMeasure) => StaffMeasureDescription; stretch?: (measure: StaffMeasure, first: boolean, spacing: number) => ScoreStretch }
/** Fixed minima and private drawing models are prepared once in this task. */
export function createStaffMeasureMinimum(hasBass: boolean, measureText: MeasureText, preparation: StaffPreparation = createStaffPreparation()): StaffMeasureMinimum {
  const metrics = new WeakMap<StaffMeasure, Array<StaffMeasureMetrics | undefined>>()
  const widths = new WeakMap<StaffMeasure, Array<Map<number, number>>>()
  const minimum: StaffMeasureMinimum = (measure, first, spacing) => {
    let variants = widths.get(measure)
    if (!variants) { variants = [new Map(), new Map()]; widths.set(measure, variants) }
    const index = first ? 1 : 0
    const cached = variants[index]!.get(spacing)
    if (cached !== undefined) return cached
    let pair = metrics.get(measure)
    if (!pair) { pair = []; metrics.set(measure, pair) }
    let fixed = pair[index]
    if (!fixed) {
      fixed = pair[index] = preparation.measure(measure, first, hasBass, measureText).metrics
    }
    const value = staffMinimumAtSpacing(fixed, spacing)
    variants[index]!.set(spacing, value)
    return value
  }
  minimum.stretch = (measure, first, spacing) => staffSpacingStretch(preparation.measure(measure, first, hasBass, measureText), spacing)
  minimum.preferred = minimum
  const localReadings = new WeakMap<StaffMeasure, Map<string, number>>()
  minimum.localReading = (measure, spacing, extra) => {
    let variants = localReadings.get(measure)
    if (!variants) { variants = new Map(); localReadings.set(measure, variants) }
    const key = `${spacing}:${extra}`
    let penalty = variants.get(key)
    if (penalty === undefined) {
      penalty = staffReadingSpacing(preparation.measure(measure, false, hasBass, measureText), spacing, extra).compressionPenalty
      variants.set(key, penalty)
    }
    return penalty
  }
  minimum.rhythmic = (measure, first, spacing, extra) => staffRhythmicSpacing(preparation.measure(measure, first, hasBass, measureText), spacing, extra)
  const weights = new WeakMap<StaffMeasure, number>()
  minimum.weight = measure => {
    let weight = weights.get(measure)
    if (weight === undefined) {
      weight = staffSpacingWeight(preparation.measure(measure, false, hasBass, measureText)) || 1
      weights.set(measure, weight)
    }
    return weight
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
export function prepareStaffLineGraph(document: StaffDocument, width: number, equal: boolean, measureText: MeasureText, spacing: number,
  suppliedMinimum?: StaffMeasureMinimum) {
  const minimum = suppliedMinimum ?? createStaffMeasureMinimum(document.hasBass, measureText, createStaffPreparation(document))
  const available = (width - scoreLayoutConfig.staff.contentEdgeInset) / STAFF_SCALE
  const measured: MeasuredStaffMeasure[] = []
  const measureOne = (measure: StaffMeasure): MeasuredStaffMeasure => {
    const body = minimum(measure, false, spacing)
    const solo = minimum(measure, true, spacing)
    const label = measure.melody[0]?.event
    const { labelWidth, weight } = minimum.describe?.(measure) ?? describeStaffMeasure(measure, measureText)
    const inset = labelWidth && !label?.sectionLabelBreakAfter && labelWidth <= width / 2 ? labelWidth / STAFF_SCALE : 0
    return { id: measure.id, measure, body, reading: minimum.preferred?.(measure, false, spacing) ?? body, head: solo - body + inset, inset, weight: minimum.weight?.(measure) ?? weight,
      stretch: minimum.stretch ? [minimum.stretch(measure, false, spacing), minimum.stretch(measure, true, spacing)] : undefined }
  }
  const visit = (measure: StaffMeasure, depth = 0) => {
    const item = measureOne(measure)
    const occupied = item.body + item.head
    if (occupied > available && depth < 10) {
      const { beats } = minimum.describe?.(measure) ?? describeStaffMeasure(measure, measureText)
      const fragments = (minimum.split ?? splitStaffMeasure)(measure, beats * Math.max(0.1, (available - item.head - scoreLayoutConfig.staff.engine.fragmentSafetyInset) / Math.max(item.body, occupied - item.head)) * 0.85)
      if (fragments.length > 1) { fragments.forEach(f => visit(f, depth + 1)); return }
      if (item.body + item.head > available) throw new Error(`单个五线谱事件无法放入当前版宽：${measure.id}`)
    }
    measured.push(item)
  }
  document.measures.forEach(m => visit(m))
  const minimumFor = (members: MeasuredStaffMeasure[]) => equal
    ? Math.max(...members.map(m => m.body)) * members.length + members[0]!.head
    : members.reduce((sum, m) => sum + m.body, 0) + members[0]!.head
  const candidates: ScoreLineCandidate[][] = measured.map((_, start) => {
    const rows: ScoreLineCandidate[] = []
    for (let end = start + 1; end <= measured.length; end++) {
      if (end > start + 1 && measured[end - 1]!.measure.force) break
      const occupied = minimumFor(measured.slice(start, end))
      if (occupied > available && end > start + 1) break
      rows.push({ end, density: occupied / available })
    }
    return rows
  })
  const inheritedTarget = (previous: StaffLine, line: StaffLine) => {
    const inherited = equal ? Math.max(line.minimum, (previous.target - previous.measures[0]!.head) / previous.measures.length * line.measures.length + line.measures[0]!.head)
      : inheritScoreStretchWidth({ minimumWidth: line.minimum, stretch: staffLineStretch(line) },
        { minimumWidth: previous.minimum, stretch: staffLineStretch(previous) }, previous.target)
    return lastLineWidth(line.minimum, inherited, available, equal ? 0 : line.minimum)
  }
  // A row's full-width metrics depend on its members, not on the other
  // breaks in the candidate plan. Ending shortening still uses each plan's
  // own preceding rows and never mutates these cached full-width metrics.
  const rowMetrics = new Map<number, { members: MeasuredStaffMeasure[]; minimumWidth: number; weight: number; rhythmicReady: boolean; gap?: number; gaps?: readonly number[] }>()
  const makeLines = (ends: number[], shorten = true, begin = 0, rhythmic = true) => {
    const lines: StaffLine[] = []
    let start = begin
    for (const end of ends) {
      const key = start * (measured.length + 1) + end
      let metrics = rowMetrics.get(key)
      if (!metrics) {
        const members = measured.slice(start, end)
        metrics = { members, minimumWidth: minimumFor(members),
          weight: members.reduce((sum, member) => sum + member.weight, 0), rhythmicReady: false }
        rowMetrics.set(key, metrics)
      }
      const { members, minimumWidth, weight } = metrics
      const line: StaffLine = { measures: members.slice(), minimum: minimumWidth, reading: minimumWidth,
        target: Math.max(available, minimumWidth), weight }
      if (rhythmic && minimum.rhythmic) {
        if (!metrics.rhythmicReady) {
          let gap = 0, weights = 0
          const gaps: number[] = []
          const extras = staffLineExtras(line, equal)
          members.forEach((member, index) => {
            const cell = extras[index]!
            const result = minimum.rhythmic!(member.measure, index === 0, spacing, Math.max(0, cell))
            gap += result.gap; weights += result.weight
            gaps.push(...result.gaps)
          })
          if (weights > 0) metrics.gap = gap / weights
          metrics.gaps = gaps
          metrics.rhythmicReady = true
        }
        if (metrics.gap !== undefined) line.unitRhythmicGap = metrics.gap
        line.rhythmicGaps = metrics.gaps
      }
      lines.push(line); start = end
    }
    // Section endings use the same actual-spacing safeguard as numbered music.
    if (shorten) {
      let sum = 0, count = 0
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!, previous = lines[i - 1], next = lines[i + 1]
        if (line.measures[0]!.measure.section) { sum = 0; count = 0 }
        if ((!next || next.measures[0]!.measure.section) && previous && !line.measures[0]!.measure.section) {
          const fill = count > 0 && !equal && line.unitRhythmicGap !== undefined && line.unitRhythmicGap <= 1.5 * sum / count
          if (!fill) {
            line.target = inheritedTarget(previous, line)
          }
        } else if (line.unitRhythmicGap !== undefined) { sum += line.unitRhythmicGap; count++ }
      }
    }
    return lines
  }
  return { candidates, measured, makeLines, inheritedTarget }
}

export function planStaffLines(document: StaffDocument, width: number, equal: boolean, measureText: MeasureText, spacing: number,
  suppliedMinimum?: StaffMeasureMinimum, _rowCost = 1): StaffLine[] {
  const graph = prepareStaffLineGraph(document, width, equal, measureText, spacing, suppliedMinimum)
  return graph.makeLines(planScoreLinesGlobally(graph.candidates))
}

const lineStretchPlans = new WeakMap<StaffLine, { groups: ScoreStretch[]; merged: ScoreStretch }>()
function staffLinePlans(line: StaffLine) {
  let saved = lineStretchPlans.get(line)
  if (!saved) {
    const groups = line.measures.map((member, index) => member.stretch?.[index === 0 ? 1 : 0] ?? prepareScoreStretch([member.weight]))
    saved = { groups, merged: mergeScoreStretch(groups) }
    lineStretchPlans.set(line, saved)
  }
  return saved
}
export function staffLineStretch(line: StaffLine): ScoreStretch { return staffLinePlans(line).merged }
/** The same allocation drives rhythmic scoring and final measure drawing. */
export function staffLineExtras(line: StaffLine, equal: boolean): number[] {
  if (equal) return line.measures.map(member => (line.target - line.measures[0]!.head) / line.measures.length - member.body)
  return distributeScoreStretchGroups(staffLinePlans(line).groups, Math.max(0, line.target - line.minimum))
}
