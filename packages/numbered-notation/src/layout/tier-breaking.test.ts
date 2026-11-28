import { expect, it } from 'vitest'
import { planScoreTier } from './tier-breaking.js'
import { prepareScorePagination } from './pagination.js'
import { scoreVerticalSpacing } from './policy.js'
import type { ScoreLineCandidate } from './line-breaking.js'
import type { ScorePageBlock } from './geometry.js'

it('retains sparse rows in every tier and exempts forced and terminal endings', () => {
  const graph = [[{end: 1, density: .6}], [{end: 2, density: .1}]]
  expect(planScoreTier(graph, 2/3, end => end === 2)).toEqual([1, 2])
  expect(planScoreTier(graph, .5, end => end === 2)).toEqual([1, 2])
  expect(planScoreTier(graph, 2/3, () => true)).toEqual([1, 2])
})
it('matches exhaustive legal break plans with terminal and forced exemptions', () => {
  let seed = 67
  const random = () => {seed = seed * 16807 % 2147483647; return seed / 2147483647}
  for (let trial = 0; trial < 60; trial++) {
    const graph: ScoreLineCandidate[][] = Array.from({length: 7}, (_, start) =>
      Array.from({length: Math.min(3, 7 - start)}, (_, i) => ({end: start + i + 1, density: .3 + random() * .8})))
    const exempt = (end: number) => end === 7 || end === 3
    let best = Infinity
    const visit = (start: number, cost: number) => {
      if (start === graph.length) {best = Math.min(best, cost); return}
      for (const row of graph[start]!)
        visit(row.end, cost + (exempt(row.end) ? 0 : Math.max(0, 1-row.density)**2 + Math.max(0, 1-row.density/(2/3))**2) + 100*Math.max(0,row.density-1)**2)
    }
    visit(0, 0)
    const ends = planScoreTier(graph, 2/3, exempt)
    if (!Number.isFinite(best)) {expect(ends).toBeUndefined(); continue}
    let start = 0, cost = 0
    for (const end of ends!) {const row = graph[start]!.find(row => row.end === end)!;
      cost += (exempt(end) ? 0 : Math.max(0, 1-row.density)**2 + Math.max(0, 1-row.density/(2/3))**2) + 100*Math.max(0,row.density-1)**2; start = end}
    expect(cost).toBeCloseTo(best, 10)
  }
})
it.each(['numbered', 'staff'] as const)('maximizes one score-wide gap and repaginates in %s', notation => {
  const vertical = scoreVerticalSpacing(notation), em = vertical.minimum / .8
  const rows: ScorePageBlock[] = Array.from({length: 18}, () => ({height: em, core: {top:0,bottom:em}, ink: [{left:0,right:10,top:0,bottom:em}]}))
  const paginate = prepareScorePagination(rows)
  const options = {pageHeight: 18.7*em, margin:0, gap:vertical.minimum, vertical}
  const minimum = paginate({...options, vertical: {...vertical, maximum: vertical.minimum}})
  expect(minimum.positions.filter(p => p.page === 0)).toHaveLength(10)
  const fitted = paginate(options), n = fitted.coreGaps[0]!
  expect(fitted.heights).toHaveLength(2)
  expect(fitted.positions.filter(p => p.page === 0)).toHaveLength(9)
  expect(fitted.coreGaps).toEqual([n,n])
  expect(n).toBeCloseTo(1.2125*em, 5)
  expect(paginate({...options, vertical: {minimum:n+.001,comfortable:vertical.comfortable,maximum:n+.001}}).heights).toHaveLength(3)
})
it('checks remote ink without mutating measured row geometry', () => {
  const rows: ScorePageBlock[] = [0,20,0].map(left => ({height:10,core:{top:0,bottom:10},ink:[{left,right:left+10,top:0,bottom:10}]}))
  rows[0] = {...rows[0]!, ink:[{left:0,right:10,top:0,bottom:80}]}
  const before = JSON.stringify(rows)
  const fitted = prepareScorePagination(rows)({pageHeight:160,margin:0,gap:8,vertical:{minimum:8,comfortable:12,maximum:16}})
  expect(fitted.positions[2]!.top-fitted.positions[0]!.top).toBeGreaterThanOrEqual(80+.5*fitted.coreGaps[0]!)
  expect(JSON.stringify(rows)).toBe(before)
})
