/** One legal row. Density is its hard minimum width / available width. */
export type NativeLineCandidate = { end: number; density: number; penalty?: number }
type Plan = { end: number; count: number; sum: number; square: number; penalty: number; previous?: Plan }
const epsilon = 1e-12
type WeightedRow = { end: number; density: number; stretch: number; penalty: number; sourcePenalty?: number }
const weightedRows = new WeakMap<NativeLineCandidate, WeightedRow>()
function weightedRow(row: NativeLineCandidate): WeightedRow {
  let saved = weightedRows.get(row)
  if (!saved || saved.end !== row.end || saved.density !== row.density || saved.sourcePenalty !== row.penalty) {
    saved = { end: row.end, density: row.density, stretch: Math.max(0, 1 - row.density),
      penalty: (row.penalty ?? 0) + 100 * Math.max(0, row.density - 1) ** 2, sourcePenalty: row.penalty }
    weightedRows.set(row, saved)
  }
  return saved
}

const planPaths = new WeakMap<Plan, number[]>()
function ends(plan: Plan): number[] {
  const cached = planPaths.get(plan)
  if (cached) return cached
  const result: number[] = []
  for (let current: Plan | undefined = plan; current?.count; current = current.previous) result.push(current.end)
  result.reverse()
  planPaths.set(plan, result)
  return result
}
function earlier(a: Plan, b: Plan) {
  const x = ends(a), y = ends(b)
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i]! > y[i]!
  return false
}
const ordinate = (p: Plan) => 2 * p.square + p.penalty
const objective = (p: Plan) => p.count ? ordinate(p) - p.sum * p.sum / p.count : 0

/** At the same endpoint and row count, every suffix adds the same statistics.
 * The final objective is concave in (sum, 2*square+penalty); a point above the
 * lower convex hull cannot beat both of the vertices below it for any suffix.
 * Keep all hull vertices, rather than rounding stretch or imposing a beam cap. */
function hull(points: Plan[]): Plan[] {
  points.sort((a, b) => a.sum - b.sum || ordinate(a) - ordinate(b))
  const unique: Plan[] = []
  for (const point of points) {
    const last = unique.at(-1)
    if (last?.sum === point.sum) {
      if (ordinate(point) === ordinate(last) && earlier(point, last)) unique[unique.length - 1] = point
    } else unique.push(point)
  }
  const result: Plan[] = []
  for (const point of unique) {
    while (result.length > 1) {
      const a = result[result.length - 2]!, b = result[result.length - 1]!
      const cross = (b.sum - a.sum) * (ordinate(point) - ordinate(a)) - (ordinate(b) - ordinate(a)) * (point.sum - a.sum)
      if (cross > 0) break
      result.pop()
    }
    result.push(point)
  }
  return result
}

/** Full-score optimum: sum(r²) + sum((r-mean(r))²), r=max(0,1-density).
 * Forced breaks are encoded by missing crossing edges, not separate solves.
 * Overflow penalties apply only to unavoidable indivisible oversized events.
 * No per-row charge or adjacent-row approximation. */
export function planNativeLines(candidates: readonly (readonly NativeLineCandidate[])[], timings?: Record<string, number>): number[]
export function planNativeLines(candidates: readonly (readonly NativeLineCandidate[])[], timings: Record<string, number> | undefined, maximumCost: number): number[] | undefined
export function planNativeLines(candidates: readonly (readonly NativeLineCandidate[])[], timings?: Record<string, number>, maximumCost = Infinity): number[] | undefined {
  const count = candidates.length
  if (!count) return []
  let root: Plan = { end: 0, count: 0, sum: 0, square: 0, penalty: 0 }
  const rows: Array<WeightedRow[] | undefined> = []
  const rowsAt = (start: number) => rows[start] ??= candidates[start]!.map(weightedRow)
  const append = (previous: Plan, row: WeightedRow): Plan => ({ end: row.end,
    count: previous.count + 1, sum: previous.sum + row.stretch,
    square: previous.square + row.stretch ** 2, penalty: previous.penalty + row.penalty, previous })
  // Page-constrained subproblems fix a common prefix. Accumulate that prefix
  // once, preserving addition order and the original tie-breaking path.
  while (root.end < count && candidates[root.end]!.length === 1) root = append(root, weightedRow(candidates[root.end]![0]!))
  if (root.end === count) return objective(root) <= maximumCost + epsilon ? ends(root) : undefined
  const lower = Array<number>(count + 1).fill(Infinity)
  const baseline = Array<WeightedRow | undefined>(count)
  lower[count] = 0
  for (let start = count - 1; start >= root.end; start--) for (const row of rowsAt(start)) {
    const cost = row.stretch ** 2 + row.penalty + lower[row.end]!
    if (cost < lower[start]! || cost === lower[start] && row.end > (baseline[start]?.end ?? 0)) {
      lower[start] = cost; baseline[start] = row
    }
  }
  let best = root
  for (let start = root.end; start < count;) {
    const row = baseline[start]
    if (!row) throw new Error('换行候选无法覆盖完整内容。')
    best = append(best, row); start = row.end
  }
  let bestCost = Math.min(objective(best), maximumCost)
  const states = Array.from({ length: count }, () => new Map<number, Plan[]>())
  states[root.end]!.set(root.count, [root])
  for (let start = root.end; start < count; start++) {
    for (const points of states[start]!.values()) {
      const retained = hull(points)
      if (timings) {
        timings.linePlanningRetainedStates = (timings.linePlanningRetainedStates ?? 0) + retained.length
        timings.linePlanningMaximumHull = Math.max(timings.linePlanningMaximumHull ?? 0, retained.length)
      }
      for (const previous of retained) {
        // The remaining sum of squares is an admissible lower bound: the
        // full-score variance contribution is nonnegative, even across breaks.
        const prefixVariance = previous.count ? Math.max(0, previous.square - previous.sum * previous.sum / previous.count) : 0
        if (previous.square + previous.penalty + lower[start]! + prefixVariance > bestCost + epsilon) continue
        for (const row of rowsAt(start)) {
          if (timings) timings.linePlanningGeneratedStates = (timings.linePlanningGeneratedStates ?? 0) + 1
          const plan = append(previous, row)
          const variance = Math.max(0, plan.square - plan.sum * plan.sum / plan.count)
          if (plan.square + plan.penalty + lower[row.end]! + variance > bestCost + epsilon) continue
          if (row.end === count) {
            const cost = objective(plan)
            if (cost < bestCost - epsilon || Math.abs(cost - bestCost) <= epsilon && (objective(best) > maximumCost + epsilon || earlier(plan, best))) {
              best = plan; bestCost = cost
            }
          } else {
            const target = states[row.end]!
            const list = target.get(plan.count)
            if (list) list.push(plan)
            else target.set(plan.count, [plan])
          }
        }
      }
    }
    states[start]!.clear()
  }
  return objective(best) <= maximumCost + epsilon ? ends(best) : undefined
}

/** Shared sufficient-statistic hull; resource-constrained solvers additionally
 * retain earlier, lower-height vertices when later vertices replace the hull. */
export type NativeLineStatisticPlan = Plan
export function nativeLineStateHull<T extends NativeLineStatisticPlan>(points: T[]): T[] { return hull(points) as T[] }

/** Insert one point into an x-sorted lower hull without re-sorting its old
 * vertices. Resource frontiers query the hull after every insertion. */
export function insertNativeLineStateHull<T extends NativeLineStatisticPlan>(vertices:T[],point:T):boolean {
  let low=0,high=vertices.length
  while(low<high){const middle=(low+high)>>>1;if(vertices[middle]!.sum<point.sum)low=middle+1;else high=middle}
  let index=low
  const old=vertices[index]
  if(old?.sum===point.sum) {
    if(ordinate(point)>ordinate(old) || ordinate(point)===ordinate(old) && !earlier(point,old))return false
    vertices.splice(index,1)
  }
  const cross=(a:T,b:T,c:T)=>(b.sum-a.sum)*(ordinate(c)-ordinate(a))-(ordinate(b)-ordinate(a))*(c.sum-a.sum)
  if(index>0 && index<vertices.length && cross(vertices[index-1]!,point,vertices[index]!)<=0)return false
  vertices.splice(index,0,point)
  while(index>1 && cross(vertices[index-2]!,vertices[index-1]!,vertices[index]!)<=0){vertices.splice(index-1,1);index--}
  while(index+2<vertices.length && cross(vertices[index]!,vertices[index+1]!,vertices[index+2]!)<=0)vertices.splice(index+1,1)
  return true
}
