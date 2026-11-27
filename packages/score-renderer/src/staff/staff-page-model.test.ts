import { expect, it } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { type ScoreHeightEnvelope } from '@m3n/numbered-notation'
import { projectStaffDocument } from './staff-document.js'
import { prepareStaffLineGraph } from './line-layout.js'
import { staffPageCostModel } from './staff-page-model.js'
import { staffRowBlock } from './staff-row-pagination.js'
import { textMeasurer } from './layout-svg.js'
import type { StaffSystem } from './system-layout.js'

it.each([false, true])('matches exact ending targets for every small-score partition, equal=%s', equal => {
  const score = analyzeM3N('{4/4}\nN: 1 2 3 4 | (1 2 3 4) 5 6 | 7 1e 2e 3e | 1^^ | 2 3 4 5 | 6 7 1e 2e |||').score
  const graph = prepareStaffLineGraph(projectStaffDocument(score), 600, equal, textMeasurer(), .6)
  const paths = (at = 0): number[][] => at === graph.measured.length ? [[]]
    : graph.candidates[at]!.flatMap(row => paths(row.end).map(rest => [row.end, ...rest]))
  const cache = new Map<string, StaffSystem>()
  const envelopes: ScoreHeightEnvelope[] = graph.measured.map(() => ({ coreAbove: 10, coreBelow: 10, extraAbove: 0, extraBelow: 0, hasLyrics: false }))
  const model = staffPageCostModel(graph, cache, envelopes, equal, 30, 900, 40)
  for (const path of paths()) {
    const lines = graph.makeLines(path)
    let start = 0
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]!, end = path[index]!
      const envelope = { ...envelopes[0]!, extraAbove: line.target / 100, extraBelow: line.target / 200 }
      cache.set(`${start}:${end}:${line.target}`, { envelope, section: false } as StaffSystem)
      start = end
    }
  }
  for (const path of paths()) {
    const lines = graph.makeLines(path)
    let start = 0, sum = 0, count = 0
    lines.forEach((line, index) => {
      const end = path[index]!, previousStart = index ? path[index - 2] ?? 0 : -1
      const reference = index ? count ? sum / count : -Infinity : Infinity
      const expected = staffRowBlock(cache.get(`${start}:${end}:${line.target}`)!, index, 30)
      expect(model.blockFor(start, end, previousStart, reference)).toEqual({ ...expected, resolvedInk: true })
      const gap = graph.makeLines([end], false, start)[0]!.unitRhythmicGap
      if (gap !== undefined) { sum += gap; count++ }
      start = end
    })
  }
})
