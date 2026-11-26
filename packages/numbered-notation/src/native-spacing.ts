/** Geometry consumed by the project-owned horizontal solver. All units are px. */
export type SpacingCell = {
  lane: string
  /** Sparse ink lanes constrain only columns that actually carry ink. */
  sparse?: boolean
  left: number
  right: number
  before: number
  after: number
  /** Relative share of positive justification surplus; defaults to 1. */
  beforeStretch?: number
  afterStretch?: number
  /** Soft extra clearance beyond this lane's hard ink reservation. */
  preferredAfter?: number
  /** Soft centre-to-centre reading advance, in this notation's own scale. */
  preferredAdvance?: number
  /** Music reservation before voice-local lyrics and parentheses are added. */
  placeholderLeft?: number
  placeholderRight?: number
}
export type SpacingColumn = { cells: SpacingCell[]; fixedAfter?: number }
export type SpacingSolution = { positions: number[]; minimumWidth: number; stretchWeight: number }

/** Spend at most a quarter of the surplus on tight local reading intervals.
 * The rest retains the existing rhythmic springs. All increments are positive,
 * so hard constraints, synchronous voices and the requested width stay intact. */
export function distributeSpacingSurplus(columns: readonly SpacingColumn[], positions: readonly number[], weights: readonly number[], free: number): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0 || free <= 0) return [...positions]
  let accumulated = 0
  const cumulative = weights.slice(0, positions.length).map(weight => accumulated += weight)
  const baseline = positions.map((position, index) => position + free * cumulative[index]! / total)
  const demands = weights.map(() => 0)
  const previous = new Map<string, { index: number; cell: SpacingCell }>()
  columns.forEach((column, index) => column.cells.forEach(cell => {
    const prior = previous.get(cell.lane)
    if (prior && (prior.cell.preferredAfter || prior.cell.preferredAdvance)) {
      const gap = baseline[index]! - cell.left - cell.before - baseline[prior.index]! - prior.cell.right - prior.cell.after
      const deficit = Math.max(0, (prior.cell.preferredAfter ?? 0) - gap,
        (prior.cell.preferredAdvance ?? 0) - (baseline[index]! - baseline[prior.index]!))
      const span = cumulative[index]! - cumulative[prior.index]!
      if (span > 0) for (let edge = prior.index + 1; edge <= index; edge++) {
        demands[edge] = Math.max(demands[edge]!, deficit * weights[edge]! / span)
      }
    }
    previous.set(cell.lane, { index, cell })
  }))
  const needed = demands.reduce((sum, value) => sum + value, 0)
  const budget = Math.min(free * .25, needed)
  let adjustment = 0
  return positions.map((position, index) => {
    adjustment += needed ? demands[index]! * budget / needed : 0
    return position + adjustment + (free - budget) * cumulative[index]! / total
  })
}

/**
 * Place columns at their minimum clearances, then distribute positive surplus.
 * Each voice contributes constraints to the same time-column coordinates.
 * This is deliberately independent of source syntax, SVG and music objects.
 * fillEdges gives free bar-adjacent boundaries weight 1 in positive justification.
 */
export function solveNativeSpacing(columns: readonly SpacingColumn[], width = Infinity, justify = false, fillEdges: { left?: boolean; right?: boolean } = {}): SpacingSolution {
  if (!columns.length) return { positions: [], minimumWidth: 0, stretchWeight: 0 }
  if (width !== Infinity && (!Number.isFinite(width) || width <= 0)) throw new Error('音符排版宽度必须为正数。')
  const laneSet = new Set<string>(), sparse = new Set<string>()
  for (const column of columns) for (const cell of column.cells) {
    laneSet.add(cell.lane)
    if (cell.sparse) sparse.add(cell.lane)
  }
  const lanes = [...laneSet]
  if ((!justify || width === Infinity) && !columns.some(column => column.fixedAfter !== undefined)) {
    // Minimum-width probes need only the running voice ends and the preceding
    // spring weights. Avoid materializing a column × voice matrix for every
    // overlapping line candidate; retain the same lane and arithmetic order.
    const ends = lanes.map(() => 0), after = lanes.map(() => 0), positions: number[] = []
    const cells: Array<SpacingCell | undefined> = []
    let cumulative = fillEdges.left ? 1 : 0
    for (let index = 0; index < columns.length; index++) {
      const column = columns[index]!
      let maxLeft = 0, maxRight = 0
      for (const cell of column.cells) if (!cell.sparse) {
        maxLeft = Math.max(maxLeft, cell.placeholderLeft ?? cell.left)
        maxRight = Math.max(maxRight, cell.placeholderRight ?? cell.right)
      }
      let position = -Infinity, weight = -Infinity
      for (let lane = 0; lane < lanes.length; lane++) {
        const cell = cells[lane] = column.cells.find(cell => cell.lane === lanes[lane])
        position = Math.max(position, cell ? ends[lane]! + cell.left + cell.before
          : sparse.has(lanes[lane]!) ? 0 : ends[lane]! + 0 + maxLeft)
        if (index) weight = Math.max(weight, (after[lane]! + (cell ? cell.beforeStretch ?? 1 : 0)) / 2)
        after[lane] = cell ? cell.afterStretch ?? 1 : 0
      }
      positions.push(position)
      for (let lane = 0; lane < lanes.length; lane++) {
        const cell = cells[lane]
        if (cell) ends[lane] = position + cell.right + cell.after
        else if (!sparse.has(lanes[lane]!)) ends[lane] = position + 0 + maxRight
      }
      if (index) cumulative += weight
    }
    return { positions, minimumWidth: Math.max(...ends), stretchWeight: cumulative + (fillEdges.right ? 1 : 0) }
  }
  const rows = columns.map(column => {
    let maxLeft = 0, maxRight = 0
    for (const cell of column.cells) if (!cell.sparse) {
      maxLeft = Math.max(maxLeft, cell.placeholderLeft ?? cell.left)
      maxRight = Math.max(maxRight, cell.placeholderRight ?? cell.right)
    }
    return lanes.map<SpacingCell & { active?: boolean }>(lane => {
      const found = column.cells.find(cell => cell.lane === lane)
      // Solver inputs are read-only. Reuse real cells rather than copying
      // every music and lyric cell for every overlapping line candidate.
      if (found) return found
      if (sparse.has(lane)) return { lane, sparse: true, active: false, left: 0, right: 0, before: 0, after: 0, beforeStretch: 0, afterStretch: 0 }
      return {
        lane, active: true, left: 0, right: 0, before: maxLeft, after: maxRight,
        beforeStretch: 0, afterStretch: 0,
      }
    })
  })
  if (columns.some(column => column.fixedAfter !== undefined)) {
    const groups: SpacingColumn[] = [], members: { group: number; offset: number }[] = []
    for (let start = 0; start < columns.length;) {
      let end = start, offset = 0
      members[start] = { group: groups.length, offset }
      while (end + 1 < columns.length && columns[end]!.fixedAfter !== undefined) {
        offset += columns[end]!.fixedAfter!
        members[++end] = { group: groups.length, offset }
      }
      groups.push({ cells: lanes.flatMap((lane, row) => {
        const occupied = rows.slice(start, end + 1).flatMap((cells, i) => cells[row]!.active !== false ? [{ cell: cells[row]!, offset: members[start + i]!.offset }] : [])
        if (!occupied.length) return []
        return [{
          ...occupied[0]!.cell, lane,
          left: Math.max(...occupied.map(({ cell, offset }) => cell.left - offset)),
          right: Math.max(...occupied.map(({ cell, offset }) => offset + cell.right)),
          afterStretch: occupied.at(-1)!.cell.afterStretch,
          after: occupied.at(-1)!.cell.after,
          preferredAfter: occupied.at(-1)!.cell.preferredAfter,
          preferredAdvance: occupied.at(-1)!.cell.preferredAdvance === undefined ? undefined
            : occupied.at(-1)!.offset + occupied.at(-1)!.cell.preferredAdvance!,
        }]
      }) })
      start = end + 1
    }
    const solved = solveNativeSpacing(groups, width, justify, fillEdges)
    return { ...solved, positions: members.map(member => solved.positions[member.group]! + member.offset) }
  }
  const positions: number[] = [], ends = lanes.map(() => 0)
  rows.forEach(row => {
    let position = -Infinity
    for (let lane = 0; lane < row.length; lane++) {
      const cell = row[lane]!
      position = Math.max(position, cell.active !== false ? ends[lane]! + cell.left + cell.before : 0)
    }
    positions.push(position)
    row.forEach((cell, lane) => { if (cell.active !== false) ends[lane] = position + cell.right + cell.after })
  })
  const minimumWidth = Math.max(...ends)
  const cumulative = [fillEdges.left ? 1 : 0]
  for (let index = 1; index < positions.length; index++) {
    let weight = -Infinity
    for (let lane = 0; lane < lanes.length; lane++) weight = Math.max(weight,
      ((rows[index - 1]![lane]!.afterStretch ?? 1) + (rows[index]![lane]!.beforeStretch ?? 1)) / 2)
    cumulative.push(cumulative[index - 1]! + weight)
  }
  const stretchWeight = cumulative.at(-1)! + (fillEdges.right ? 1 : 0)
  if (justify && width !== Infinity) {
    const left = Math.min(...rows.flatMap((row, i) => row.filter(cell => cell.active !== false).map(cell => positions[i]! - cell.left)))
    const right = Math.max(...rows.flatMap((row, i) => row.filter(cell => cell.active !== false).map(cell => positions[i]! + cell.right)))
    const occupied = right - left
    const shift = -left, free = Math.max(0, width - occupied)
    const weights = cumulative.map((value, index) => value - (cumulative[index - 1] ?? 0))
    weights.push(fillEdges.right ? 1 : 0)
    const filled = distributeSpacingSurplus(columns, positions, weights, free)
    positions.forEach((_, index) => { positions[index] = filled[index]! + shift })
  }
  return { positions, minimumWidth, stretchWeight }
}
