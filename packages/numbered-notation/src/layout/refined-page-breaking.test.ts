import { expect, it } from 'vitest'
import { planScoreLinesGlobally, type ScoreLineCandidate } from './line-breaking.js'
import { greedyScoreLines, scoreLinePlanCost, planScoreLinesWithinPages } from './page-line-breaking.js'
import { planScoreLinesWithRefinedPages } from './refined-page-breaking.js'
import { prepareScorePagination, type ScorePageBlock } from './pagination.js'

it.each([[false,false],[true,false],[false,true],[true,true]])('keeps refinement exact or returns a measured feasible plan under a candidate budget (%s, boundary=%s)', (estimated,boundary) => {
  const globals=globalThis as {__m3nExperimentalRowReuse?:boolean;__m3nExperimentalPageCostPasses?:number;__m3nExperimentalSingleTier?:boolean}
  const before={reuse:globals.__m3nExperimentalRowReuse,passes:globals.__m3nExperimentalPageCostPasses,single:globals.__m3nExperimentalSingleTier}
  globals.__m3nExperimentalRowReuse=estimated;globals.__m3nExperimentalPageCostPasses=1;globals.__m3nExperimentalSingleTier=boundary
  try {
  let seed = 1097, violations = 0
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  for (let trial = 0; trial < 120; trial++) {
    const count = 6 + trial % 2
    const graph: ScoreLineCandidate[][] = Array.from({ length: count }, (_, start) =>
      Array.from({ length: Math.min(3, count - start) }, (_, index) => ({ end: start + index + 1, density: .25 + random() * .75 })))
    const exact = graph.map((rows, start) => new Map(rows.map(row => {
      const bottom = 10 + random() * 60
      return [row.end, { height: bottom, core: { top: 0, bottom: 10 },
        ink: [{ left: start % 2 * 2, right: start % 2 * 2 + 1, top: 0, bottom }], resolvedInk: true } satisfies ScorePageBlock]
    })))
    const lower: ScorePageBlock = { height: 10, core: { top: 0, bottom: 10 }, ink: [{ left: 0, right: 1, top: 0, bottom: 10 }], resolvedInk: false }
    const options = { pageHeight: 115, margin: 0, gap: 15, headerGap: 0,}
    const learned = new Map<string, ScorePageBlock>()
    const evaluate = (ends: number[]) => {
      let start = 0
      const blocks = ends.map(end => {
        const block = exact[start]!.get(end)!
        learned.set(`${start}:${end}`, block); start = end; return block
      })
      return { ends, pages: prepareScorePagination(blocks, {})(options).heights.length, value: ends }
    }
    const greedy = evaluate(greedyScoreLines(graph)), optimum = evaluate(planScoreLinesGlobally(graph))
    if (optimum.pages > greedy.pages) violations++
    const expected = planScoreLinesWithinPages(graph, greedy, optimum, evaluate)
    learned.clear()
    evaluate(greedy.ends); evaluate(optimum.ends)
    const timings:Record<string,number>={}
    const actual = planScoreLinesWithRefinedPages(graph, greedy, optimum, evaluate, {
      candidateWidth:boundary ? 720 : 624, options, headers: [], revision: () => learned.size,
      blockFor: (start, end) => learned.get(`${start}:${end}`) ?? lower,
    },timings)
    if(estimated && (greedy.pages>1 || boundary)) {
      expect(timings.numericPageCostCalls ?? 0).toBeLessThanOrEqual(greedy.pages>1 ? 1 : 8)
      expect(evaluate(actual.ends).pages).toBe(actual.pages)
      expect(actual.pages).toBeLessThanOrEqual(greedy.pages)
      expect(scoreLinePlanCost(graph,actual.ends)).toBeLessThanOrEqual(scoreLinePlanCost(graph,greedy.ends)+1e-12)
      continue
    }
    expect(actual.ends, `trial ${trial}`).toEqual(expected.ends)
    expect(scoreLinePlanCost(graph, actual.ends)).toBeCloseTo(scoreLinePlanCost(graph, expected.ends), 12)
    expect(actual.pages).toBe(expected.pages)
  }
  expect(violations).toBeGreaterThan(10)
  } finally {globals.__m3nExperimentalRowReuse=before.reuse;globals.__m3nExperimentalPageCostPasses=before.passes;globals.__m3nExperimentalSingleTier=before.single}
})

it('propagates geometry failures instead of treating them as a candidate budget exit', () => {
  const globals=globalThis as {__m3nExperimentalRowReuse?:boolean;__m3nExperimentalPageCostPasses?:number}
  const before={reuse:globals.__m3nExperimentalRowReuse,passes:globals.__m3nExperimentalPageCostPasses}
  try {
    globals.__m3nExperimentalRowReuse=true;globals.__m3nExperimentalPageCostPasses=1
    const graph:ScoreLineCandidate[][]=[[{end:1,density:.9},{end:2,density:.1}],[{end:4,density:.9}],
      [{end:4,density:.1}],[{end:4,density:.9}]]
    const error=new Error('geometry interrupted')
    expect(()=>planScoreLinesWithRefinedPages(graph,{ends:[2,4],pages:1,value:[2,4]},
      {ends:[1,4],pages:2,value:[1,4]},()=>{throw error},{headers:[],revision:()=>0,
        options:{pageHeight:100,margin:0,gap:10,headerGap:0},blockFor:()=>{throw error}})).toThrow(error)
  } finally {globals.__m3nExperimentalRowReuse=before.reuse;globals.__m3nExperimentalPageCostPasses=before.passes}
})


it('returns the previously measured multi-page plan when its candidate refinement budget is exhausted', () => {
  const globals=globalThis as {__m3nExperimentalRowReuse?:boolean;__m3nExperimentalPageCostPasses?:number}
  const before={reuse:globals.__m3nExperimentalRowReuse,passes:globals.__m3nExperimentalPageCostPasses}
  try {
    globals.__m3nExperimentalRowReuse=true;globals.__m3nExperimentalPageCostPasses=1
    const graph:ScoreLineCandidate[][]=[[{end:1,density:.9},{end:2,density:.1}],[{end:4,density:.9}],
      [{end:4,density:.1}],[{end:4,density:.9}]]
    const greedy={ends:[2,4],pages:2,value:[2,4]},optimum={ends:[1,4],pages:3,value:[1,4]}
    const evaluate=(ends:number[])=>({ends,pages:ends.join(':')==='2:4' ? 2 : 3,value:ends})
    const timings:Record<string,number>={}
    const result=planScoreLinesWithRefinedPages(graph,greedy,optimum,evaluate,{headers:[],revision:()=>0,
      options:{pageHeight:100,margin:0,gap:10,headerGap:0},
      blockFor:()=>({height:10,core:{top:0,bottom:10},ink:[],resolvedInk:false})},timings)
    expect(result).toBe(greedy)
    expect(timings.candidatePageCostBudgetExits).toBe(1)
    expect(timings.numericPageCostCalls).toBe(1)
  } finally {globals.__m3nExperimentalRowReuse=before.reuse;globals.__m3nExperimentalPageCostPasses=before.passes}
})
