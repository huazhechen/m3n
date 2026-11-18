/** One legal row starting at its index in the candidate table. */
export type NativeLineCandidate = { end: number; density: number; penalty?: number }
type Row = NativeLineCandidate & { id: number; cost: number }
type Plan = { row: Row; cost: number; previous?: Plan }
const epsilon = 1e-12

function ends(plan: Plan | undefined): number[] {
  const result: number[] = []
  for (; plan; plan = plan.previous) result.push(plan.row.end)
  return result.reverse()
}

function better(candidate: Plan, current: Plan | undefined) {
  if (!current || candidate.cost < current.cost - epsilon) return true
  if (Math.abs(candidate.cost - current.cost) > epsilon) return false
  // Stable ties put more content on the earliest differing row.
  const a = ends(candidate), b = ends(current)
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! > b[i]!
  return false
}

function transition(previous: Row, current: Row, beforePrevious?: Row) {
  const difference = current.density - previous.density
  const curvature = beforePrevious ? beforePrevious.density - 2 * previous.density + current.density : 0
  return difference * difference + curvature * curvature
}

/** Minimise row costs plus sliding three-row density penalties over a whole
 * forced-break region. Only states with the same last TWO rows may be merged:
 * the next window still depends on both. No invented neighbours at the ends. */
export function planNativeLines(candidates: readonly (readonly NativeLineCandidate[])[]): number[] {
  const count = candidates.length
  if (!count) return []
  let id = 0
  const rows: Row[][] = candidates.map(list => list.map(row => ({ ...row, id: id++,
    cost: 1 + Math.max(0, 1 - row.density) ** 2 + 100 * Math.max(0, row.density - 1) ** 2 + (row.penalty ?? 0),
  })))
  // An optimistic suffix cost and a feasible plan bound the exact search.
  // They prune states, never discard a possible improvement to the optimum.
  const lower = Array<number>(count + 1).fill(Infinity), baseline: (Row | undefined)[] = Array(count)
  lower[count] = 0
  for (let start = count - 1; start >= 0; start--) for (const row of rows[start]!) {
    const cost = row.cost + lower[row.end]!
    if (cost < lower[start]! - epsilon || Math.abs(cost - lower[start]!) <= epsilon && row.end > (baseline[start]?.end ?? 0)) {
      lower[start] = cost; baseline[start] = row
    }
  }
  let best: Plan | undefined
  for (let start = 0; start < count;) {
    const row = baseline[start]
    if (!row) throw new Error('简谱换行候选无法覆盖完整内容。')
    best = { row, previous: best, cost: (best?.cost ?? 0) + row.cost + (best ? transition(best.row, row, best.previous?.row) : 0) }
    start = row.end
  }
  if (!best?.previous) return ends(best)
  const states = Array.from({ length: count + 1 }, () => new Map<string, Plan>())
  for (const row of rows[0]!) states[row.end]!.set(`-1:${row.id}`, { row, cost: row.cost })
  for (let start = 1; start < count; start++) {
    for (const previous of states[start]!.values()) {
      if (previous.cost + lower[start]! > best.cost + epsilon) continue
      for (const row of rows[start]!) {
        const cost = previous.cost + row.cost + transition(previous.row, row, previous.previous?.row)
        if (cost + lower[row.end]! > best.cost + epsilon) continue
        const plan = { row, cost, previous }
        if (row.end === count) {
          if (better(plan, best)) best = plan
        } else {
          const key = `${previous.row.id}:${row.id}`, target = states[row.end]!
          if (better(plan, target.get(key))) target.set(key, plan)
        }
      }
    }
    states[start]!.clear()
  }
  return ends(best)
}
