import { planScoreTier } from './layout/tier-breaking.js'
import type { NativeMeasure } from './native-model.js'
import type { NativeRenderOptions } from './native-layout-model.js'
import { splitNativeMeasure } from './native-wrapping.js'
import { nativeHorizontalSpacing } from './native-horizontal.js'
import { planScoreLinesGlobally, type ScoreLineCandidate } from './layout/line-breaking.js'

export function startsNativeSection(current: NativeMeasure, previous?: NativeMeasure): boolean {
  return !previous || current.part !== previous.part
    || !current.continuation && current.source.events.some(event => event.sectionLabel)
}

/** Split fragments retain the source measure id, but own different glyphs. */
export function nativeRowIdentity(measures:readonly NativeMeasure[]):string {
  return measures.map(measure=>!measure.continuation && measure.lastFragment ? measure.id
    : `${measure.id}[${measure.columns.map(column=>column.glyphs.map(glyph=>glyph.id).join(',')).join(';')}]`).join(':')
}

/** Break complete measures first, splitting oversized measures at time columns. */
export function breakMeasures(measures: NativeMeasure[], width: number, options: NativeRenderOptions, leading: (measures: NativeMeasure[]) => number = () => 0, timings?: Record<string, number>, rowMinimums?: Map<string, number>, endsOverride?: readonly number[], graphCache?: Map<string, ScoreLineCandidate[][]>): { lines: { measures: NativeMeasure[]; density: number }[]; ends: number[]; candidates: ScoreLineCandidate[][] } {
  const graphStarted = timings ? performance.now() : 0
  const fragments = measures.flatMap(measure => splitNativeMeasure(measure, width * (options.wrapWidthRatio ?? 1)))
  const ratio = options.wrapWidthRatio ?? 1
  const graphKey = `${width}:${ratio}`
  const cacheableGraph = fragments.length === measures.length && fragments.every((fragment,index) => fragment === measures[index])
  const cachedGraph = cacheableGraph ? graphCache?.get(graphKey) : undefined
  const candidates: ScoreLineCandidate[][] = cachedGraph ?? Array.from({ length: fragments.length }, () => [])
  for (let begin = 0; !cachedGraph && begin < fragments.length;) {
    let end = begin + 1
    while (end < fragments.length && !fragments[end]!.breakBefore && !fragments[end - 1]!.breakAfter) end++
    const group = fragments.slice(begin, end)
    // Unsplit row geometry is independent of page width. Split fragments depend
    // on the current capacity and deliberately bypass this immutable cache.
    const cacheable = rowMinimums && group.every(measure => !measure.continuation && measure.lastFragment)
    const availableFor = (start: number) => Math.max(1, width * ratio - leading([group[start]!]))
    for (let index = group.length - 1; index >= 0; index--) {
      const available = availableFor(index)
      for (let stop = index; stop < group.length; stop++) {
        const count = stop - index + 1
        // Use the same isolated constraint chain as rendering. Prefix differences
        // retain exterior margins and can incorrectly reject a legal extra bar.
        const key = cacheable ? `${group[index]!.id}:${group[stop]!.id}` : undefined
        let minWidth = key === undefined ? undefined : rowMinimums!.get(key)
        if (minWidth === undefined) {
          minWidth = nativeHorizontalSpacing(group.slice(index, stop + 1), options).minimumWidth
          if (key !== undefined) rowMinimums!.set(key, minWidth)
          if (timings) timings.lineMinimumBuilds = (timings.lineMinimumBuilds ?? 0) + 1
        } else if (timings) timings.lineMinimumCacheHits = (timings.lineMinimumCacheHits ?? 0) + 1
        if (minWidth > available && count > 1) break
        // Every row, including the final one, is scored at full width.
        candidates[begin + index]!.push({ end: begin + stop + 1, density: minWidth / available })
      }
    }
    begin = end
  }
  if (cacheableGraph && !cachedGraph) graphCache?.set(graphKey, candidates)
  if (timings) {
    timings.lineCandidateMs = (timings.lineCandidateMs ?? 0) + performance.now() - graphStarted
    timings.lineCandidateCount = (timings.lineCandidateCount ?? 0) + candidates.reduce((sum, list) => sum + list.length, 0)
  }
  const planningStarted = timings ? performance.now() : 0
  const lines: { measures: NativeMeasure[]; density: number }[] = []
  let start = 0
  const ends = endsOverride ? [...endsOverride] : options.lineDensityTarget === undefined ? planScoreLinesGlobally(candidates, timings)
    : planScoreTier(candidates, options.lineDensityTarget)
  if (!ends) throw new Error('换行候选无法覆盖完整内容。')
  for (const end of ends) {
    lines.push({ measures: fragments.slice(start, end), density: candidates[start]!.find(row => row.end === end)!.density }); start = end
  }
  if (timings) timings.linePlanningMs = (timings.linePlanningMs ?? 0) + performance.now() - planningStarted
  return { lines, ends, candidates }
}

