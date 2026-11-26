import { planNativeLines, type NativeLineCandidate } from './native-line-breaking.js'

type Graph = readonly (readonly NativeLineCandidate[])[]
type Measured<T> = { ends: number[]; pages: number; value: T }
type Problem = { prefix: number[]; excluded: number[]; ends: number[]; cost: number }
const epsilon = 1e-12

export function greedyNativeLines(graph: Graph): number[] {
  const ends: number[] = []
  for (let start = 0; start < graph.length;) {
    const end = Math.max(...graph[start]!.map(row => row.end))
    if (!Number.isFinite(end) || end <= start) throw new Error('换行候选无法覆盖完整内容。')
    ends.push(end); start = end
  }
  return ends
}

export function nativeLinePlanCost(graph: Graph, ends: readonly number[]): number {
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
export function planNativeLinesWithinPages<T>(graph: Graph, greedy: Measured<T>, optimum: Measured<T>,
  evaluate: (ends: number[]) => { pages: number; value?: T }, timings?: Record<string, number>, canFit?: (restricted: Graph, ceiling: number) => boolean): Measured<T> {
  if (optimum.pages <= greedy.pages) return optimum
  const incumbentCost = nativeLinePlanCost(graph, greedy.ends)
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
      const forced = new Map<number, number>()
      let previous = 0
      for (const end of prefix) { forced.set(previous, end); previous = end }
      const restricted = graph.map((rows, at) => forced.has(at) ? rows.filter(row => row.end === forced.get(at))
        : at === start ? rows.filter(row => !excluded.includes(row.end)) : rows)
      const reachable = Array<boolean>(graph.length + 1).fill(false)
      reachable[graph.length] = true
      for (let at = graph.length - 1; at >= 0; at--) reachable[at] = restricted[at]!.some(row => reachable[row.end])
      if (!reachable[0]) continue
      if (canFit && !canFit(restricted, greedy.pages)) {
        if (timings) timings.pageBoundHeightPrunes = (timings.pageBoundHeightPrunes ?? 0) + 1
        continue
      }
      const started = timings ? performance.now() : 0
      const ends = planNativeLines(restricted)
      if (timings) {
        timings.pageBoundDpSolves = (timings.pageBoundDpSolves ?? 0) + 1
        timings.pageBoundDpMs = (timings.pageBoundDpMs ?? 0) + performance.now() - started
      }
      const cost = nativeLinePlanCost(graph, ends)
      if (cost <= incumbentCost + epsilon) push({ prefix, excluded, ends, cost })
    }
  }
  split({ prefix: [], excluded: [], ends: optimum.ends, cost: nativeLinePlanCost(graph, optimum.ends) })
  while (queue.length) {
    const problem = pop()
    if (timings) timings.pageBoundPaginationChecks = (timings.pageBoundPaginationChecks ?? 0) + 1
    const measured = evaluate(problem.ends)
    if (measured.pages <= greedy.pages) {
      if (measured.value === undefined) throw new Error('分页可行方案缺少雕版结果。')
      return { ends: problem.ends, pages: measured.pages, value: measured.value }
    }
    split(problem)
  }
  return greedy
}
