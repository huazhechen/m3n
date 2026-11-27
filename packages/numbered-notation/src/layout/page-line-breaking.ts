import { planScoreLinesGlobally, type ScoreLineCandidate } from './line-breaking.js'

type Graph = readonly (readonly ScoreLineCandidate[])[]
type Measured<T> = { ends: number[]; pages: number; value: T }
type Problem = { prefix: number[]; excluded: number[]; ends: number[]; cost: number }
const epsilon = 1e-12

export function greedyScoreLines(graph: Graph): number[] {
  const ends: number[] = []
  for (let start = 0; start < graph.length;) {
    const end = Math.max(...graph[start]!.map(row => row.end))
    if (!Number.isFinite(end) || end <= start) throw new Error('换行候选无法覆盖完整内容。')
    ends.push(end); start = end
  }
  return ends
}

export function scoreLinePlanCost(graph: Graph, ends: readonly number[]): number {
  let start = 0, sum = 0, square = 0, penalty = 0
  for (const end of ends) {
    const row = graph[start]!.find(row => row.end === end)!
    const stretch = Math.max(0, 1 - row.density)
    sum += stretch; square += stretch ** 2
    penalty += (row.penalty ?? 0) + 100 * Math.max(0, row.density - 1) ** 2
    start = end
  }
  return 2 * square - (ends.length ? sum ** 2 / ends.length : 0) + penalty
}

function compare(a: Problem, b: Problem): number {
  if (Math.abs(a.cost - b.cost) > epsilon) return a.cost - b.cost
  for (let i = 0; i < Math.min(a.ends.length, b.ends.length); i++)
    if (a.ends[i] !== b.ends[i]) return b.ends[i]! - a.ends[i]!
  return 0
}

/** Exact horizontal optimum subject to the measured greedy page ceiling.
 * A partition is rejected only after real engraving/pagination. Lawler's
 * disjoint prefix subproblems reuse the original convex-hull DP; adding a
 * page predicate directly to its hull pruning would incorrectly discard
 * feasible paths. No row-count proxy, beam cap or quantized page height.
 * Worst-case work is exponential; instrumentation exposes that cost. */
export function planScoreLinesWithinPages<T>(graph: Graph, greedy: Measured<T>, optimum: Measured<T>,
  evaluate: (ends: number[]) => { pages: number; value?: T }, timings?: Record<string, number>, canFit?: (restricted: Graph, ceiling: number) => boolean, getFeasible?: () => Measured<T> | undefined, solveRestricted?: (graph: Graph, maximumCost: number, unconstrained?: number[]) => number[] | undefined): Measured<T> {
  if (optimum.pages <= greedy.pages) return optimum
  let incumbent = greedy, incumbentCost = scoreLinePlanCost(graph, greedy.ends)
  const improve = () => {
    const candidate = getFeasible?.()
    if (!candidate || candidate.pages > greedy.pages) return
    const cost = scoreLinePlanCost(graph,candidate.ends)
    if (compare({prefix:[],excluded:[],ends:candidate.ends,cost}, {prefix:[],excluded:[],ends:incumbent.ends,cost:incumbentCost})<0) {
      incumbent=candidate;incumbentCost=cost
    }
  }
  const queue: Problem[] = []
  const push = (problem: Problem) => {
    queue.push(problem)
    for (let index = queue.length - 1; index > 0;) {
      const parent = (index - 1) >> 1
      if (compare(queue[parent]!, queue[index]!) <= 0) break
      ;[queue[parent], queue[index]] = [queue[index]!, queue[parent]!]; index = parent
    }
    if (timings) timings.pageBoundMaximumQueue = Math.max(timings.pageBoundMaximumQueue ?? 0, queue.length)
  }
  const pop = () => {
    const result = queue[0]!, last = queue.pop()!
    if (queue.length) {
      queue[0] = last
      for (let index = 0;;) {
        let child = index * 2 + 1
        if (child >= queue.length) break
        if (child + 1 < queue.length && compare(queue[child + 1]!, queue[child]!) < 0) child++
        if (compare(queue[index]!, queue[child]!) <= 0) break
        ;[queue[index], queue[child]] = [queue[child]!, queue[index]!]; index = child
      }
    }
    return result
  }
  const split = (problem: Problem) => {
    for (let index = problem.prefix.length; index < problem.ends.length; index++) {
      const prefix = problem.ends.slice(0, index)
      const start = prefix.at(-1) ?? 0
      const excluded = index === problem.prefix.length ? [...problem.excluded, problem.ends[index]!] : [problem.ends[index]!]
      // A fixed transition has no sibling partition. Reject it before
      // copying the full graph or setting up any page-bound solver.
      const alternatives = graph[start]!.filter(row => !excluded.includes(row.end))
      if (!alternatives.length) continue
      const forced = new Map<number, number>()
      let previous = 0
      for (const end of prefix) { forced.set(previous, end); previous = end }
      const restricted = graph.map((rows, at) => forced.has(at) ? rows.filter(row => row.end === forced.get(at))
        : at === start ? alternatives : rows)
      const reachable = Array<boolean>(graph.length + 1).fill(false)
      reachable[graph.length] = true
      for (let at = graph.length - 1; at >= 0; at--) reachable[at] = restricted[at]!.some(row => reachable[row.end])
      if (!reachable[0]) continue
      improve()
      const started = timings ? performance.now() : 0
      // Shared by numbered and staff notation: page constraints cannot beat
      // the unconstrained horizontal optimum. Apply its cap before height work.
      const unconstrained = planScoreLinesGlobally(restricted, undefined, incumbentCost)
      if (!unconstrained) {
        if (timings) timings.pageBoundHorizontalPrunes = (timings.pageBoundHorizontalPrunes ?? 0) + 1
        continue
      }
      if (canFit && !canFit(restricted, greedy.pages)) {
        if (timings) timings.pageBoundHeightPrunes = (timings.pageBoundHeightPrunes ?? 0) + 1
        continue
      }
      const ends = solveRestricted ? solveRestricted(restricted,incumbentCost,unconstrained) : unconstrained
      if (!ends) continue
      if (timings) {
        timings.pageBoundDpSolves = (timings.pageBoundDpSolves ?? 0) + 1
        timings.pageBoundDpMs = (timings.pageBoundDpMs ?? 0) + performance.now() - started
      }
      const cost = scoreLinePlanCost(graph, ends)
      if (cost <= incumbentCost + epsilon) push({ prefix, excluded, ends, cost })
    }
  }
  improve()
  split({ prefix: [], excluded: [], ends: optimum.ends, cost: scoreLinePlanCost(graph, optimum.ends) })
  while (queue.length) {
    improve()
    const problem = pop()
    if (problem.cost>incumbentCost+epsilon) break
    if (timings) timings.pageBoundPaginationChecks = (timings.pageBoundPaginationChecks ?? 0) + 1
    if ((globalThis as {__m3nTraceWidths?:boolean}).__m3nTraceWidths && timings && (timings.pageBoundPaginationChecks ?? 0)%100===0)
      console.log('page-search '+JSON.stringify({checks:timings.pageBoundPaginationChecks,cost:problem.cost,incumbentCost,queue:queue.length}))
    const measured = evaluate(problem.ends)
    if (measured.pages <= greedy.pages) {
      if (measured.value === undefined) throw new Error('分页可行方案缺少雕版结果。')
      const candidate={ ends: problem.ends, pages: measured.pages, value: measured.value }
      if(compare(problem,{prefix:[],excluded:[],ends:incumbent.ends,cost:incumbentCost})<0) incumbent=candidate
      return incumbent
    }
    split(problem)
  }
  improve()
  return incumbent
}

/** A feasible incumbent only: adjacent-row balancing never replaces the
 * global solver or changes its objective/page ceiling. Strict improvements
 * make this finite without a move cap. */
export function improveFeasibleScoreLines<T>(graph: Graph, initial: Measured<T>,
  evaluate: (ends:number[])=>{pages:number;value?:T}, timings?:Record<string,number>): Measured<T> {
  let current=initial, cost=scoreLinePlanCost(graph,current.ends)
  const pages=new Map<string,number>([[current.ends.join(':'),current.pages]])
  for (;;) {
    const neighbours: {ends:number[];cost:number}[]=[]
    for(let index=0;index+1<current.ends.length;index++) {
      const start=index ? current.ends[index-1]! : 0, end=current.ends[index+1]!
      for(const row of graph[start]!) {
        if(row.end===current.ends[index] || row.end>=end || !graph[row.end]!.some(next=>next.end===end)) continue
        const ends=[...current.ends];ends[index]=row.end
        const value=scoreLinePlanCost(graph,ends)
        if(value<cost-epsilon) neighbours.push({ends,cost:value})
      }
    }
    // Paired break moves can cross a height barrier that no single move can.
    // This only tightens a verified incumbent; the exact search still proves it.
    for(let index=0;index+2<current.ends.length;index++) {
      const start=index ? current.ends[index-1]! : 0,end=current.ends[index+2]!
      for(const first of graph[start]!)for(const second of graph[first.end] ?? []) {
        if(second.end>=end || !graph[second.end]!.some(next=>next.end===end))continue
        const ends=[...current.ends];ends[index]=first.end;ends[index+1]=second.end
        const value=scoreLinePlanCost(graph,ends)
        if(value<cost-epsilon)neighbours.push({ends,cost:value})
      }
    }
    neighbours.sort((a,b)=>compare({...a,prefix:[],excluded:[]},{...b,prefix:[],excluded:[]}))
    let improved=false
    for(const candidate of neighbours) {
      const key=candidate.ends.join(':')
      if((pages.get(key) ?? 0)>initial.pages) continue
      if(timings) timings.numericBalanceChecks=(timings.numericBalanceChecks ?? 0)+1
      const measured=evaluate(candidate.ends);pages.set(key,measured.pages)
      if(measured.pages>initial.pages || measured.value===undefined) continue
      current={ends:candidate.ends,pages:measured.pages,value:measured.value};cost=candidate.cost;improved=true
      if(timings) timings.numericBalanceMoves=(timings.numericBalanceMoves ?? 0)+1
      break
    }
    if(!improved) return current
  }
}
