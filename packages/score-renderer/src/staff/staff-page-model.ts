import { scoreLayoutConfig, scoreLyricGapScale, scoreEnvelopeBlock, mergeScoreHeightEnvelopes,
  type ScoreHeightEnvelope, type ScorePageBlock, type ScorePageCostModel } from '@m3n/numbered-notation'
import type { prepareStaffLineGraph, StaffLine } from './line-layout.js'
import { staffMusicCentre, staffHeaderBlock, staffRowBlock } from './staff-row-pagination.js'
import type { StaffSystem } from './system-layout.js'

/** Geometry adapter only. Search/refinement policy belongs to the shared solver.
 * Unknown rows use immutable music bounds; measured rows use their exact ink.
 * Ending targets follow makeLines, including its section-mean safeguard. */
export function staffPageCostModel(graph: ReturnType<typeof prepareStaffLineGraph>, rowCache: ReadonlyMap<string, StaffSystem>,
  envelopes: readonly ScoreHeightEnvelope[], equal: boolean, gap: number, height: number, headerHeight: number): ScorePageCostModel {
  const lowerBlocks = new Map<number, ScorePageBlock>(), preciseBlocks = new WeakMap<StaffSystem, ScorePageBlock>()
  const fullLines = new Map<number, StaffLine>(), section: number[] = []
  const fullLine = (start: number, end: number) => {
    const key = start * (graph.measured.length + 1) + end
    let line = fullLines.get(key)
    if (!line) { line = graph.makeLines([end], false, start, !equal)[0]!; fullLines.set(key, line) }
    return line
  }
  for (let at = 0, current = 0; at < graph.measured.length; at++) {
    if (graph.measured[at]!.measure.section) current++
    section.push(current)
  }
  const terminal = (_start: number, end: number) => end === graph.measured.length || Boolean(graph.measured[end]!.measure.section)
  const lowerBlock = (start: number, end: number) => {
    const key = start * (graph.measured.length + 1) + end
    let block = lowerBlocks.get(key)
    if (!block) {
      const envelope = mergeScoreHeightEnvelopes(envelopes.slice(start, end))
      block = { ...scoreEnvelopeBlock(envelope, 1, staffMusicCentre), resolvedInk: false,
        coreGapScale: envelope.hasLyrics ? scoreLyricGapScale(gap) : 1,
        ...(start ? {} : { coreGapBefore: 0 }),
        gapBefore: start && graph.measured[start]!.measure.section ? scoreLayoutConfig.staff.sectionGap : 0 }
      lowerBlocks.set(key, block)
    }
    return block
  }
  const known = new Set<string>(), indexed = new Set<string>()
  const hasKnownRow = (start: number, end: number) => {
    if (indexed.size !== rowCache.size) for (const key of rowCache.keys()) if (!indexed.has(key)) {
      indexed.add(key)
      const split = key.indexOf(':', key.indexOf(':') + 1)
      known.add(key.slice(0, split))
    }
    return known.has(`${start}:${end}`)
  }
  return {
    headers: [staffHeaderBlock(headerHeight)],
    options: { pageHeight: height, margin: scoreLayoutConfig.staff.pageInset, gap, headerGap: 0, },
    revision: () => rowCache.size,
    reference: () => ({ emptyMean: -Infinity, required: () => !equal, section: at => section[at]!,
      gap: (start, end) => fullLine(start, end).unitRhythmicGap, terminal }),
    blockFor: (start, end, previousStart, reference) => {
      if (!hasKnownRow(start, end)) return lowerBlock(start, end)
      const line = fullLine(start, end)
      let target = line.target
      const ending = terminal(start, end) && !graph.measured[start]!.measure.section
      const contextual = !ending || previousStart !== undefined && reference !== undefined
      if (ending && previousStart !== undefined && previousStart >= 0 && reference !== undefined) {
        const fill = !equal && line.unitRhythmicGap !== undefined && line.unitRhythmicGap <= 1.5 * reference
        if (!fill) target = graph.inheritedTarget(fullLine(previousStart, start), line)
      }
      const system = contextual ? rowCache.get(`${start}:${end}:${target}`) : undefined
      if (system) {
        let block = preciseBlocks.get(system)
        if (!block) { block = { ...staffRowBlock(system, start, gap), resolvedInk: true }; preciseBlocks.set(system, block) }
        return block
      }
      return lowerBlock(start, end)
    },
  }
}
