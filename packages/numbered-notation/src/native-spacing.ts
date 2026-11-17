/** Geometry consumed by the project-owned horizontal solver. All units are px. */
export type SpacingCell = {
  lane: string
  left: number
  right: number
  before: number
  after: number
  /** Relative share of positive justification surplus; defaults to 1. */
  beforeStretch?: number
  afterStretch?: number
  /** Compression stiffness of the two elastic clearances. */
  beforeStiffness: number
  afterStiffness: number
  /** Penalty for intruding into physical ink or reserved lyric space. */
  beforeCollision: number
  afterCollision: number
  /** Music reservation before voice-local lyrics and parentheses are added. */
  placeholderLeft?: number
  placeholderRight?: number
}
export type SpacingColumn = { cells: SpacingCell[]; fixedAfter?: number }
export type SpacingSolution = { positions: number[]; naturalWidth: number }

/**
 * Minimise a chain's convex, piecewise-quadratic compression energy.
 * Each voice contributes constraints to the same time-column coordinates.
 * This is deliberately independent of source syntax, SVG and music objects.
 * fillEdges gives free bar-adjacent boundaries weight 1 in positive justification.
 */
export function solveNativeSpacing(columns: readonly SpacingColumn[], width = Infinity, justify = false, fillEdges: { left?: boolean; right?: boolean } = {}): SpacingSolution {
  if (!columns.length) return { positions: [], naturalWidth: 0 }
  if (width !== Infinity && (!Number.isFinite(width) || width <= 0)) throw new Error('音符排版宽度必须为正数。')
  const lanes = [...new Set(columns.flatMap(column => column.cells.map(cell => cell.lane)))]
  const rows = columns.map(column => {
    const maxLeft = Math.max(0, ...column.cells.map(cell => cell.placeholderLeft ?? cell.left))
    const maxRight = Math.max(0, ...column.cells.map(cell => cell.placeholderRight ?? cell.right))
    return lanes.map(lane => column.cells.find(cell => cell.lane === lane) ?? {
      lane, left: 0, right: 0, before: maxLeft, after: maxRight,
      beforeStiffness: maxLeft ? 1 / maxLeft : 1e6, afterStiffness: maxRight ? 1 / maxRight : 1e6,
      beforeCollision: 16, afterCollision: 16,
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
      groups.push({ cells: lanes.map((lane, row) => ({
        ...rows[start]![row]!, lane,
        left: Math.max(...rows.slice(start, end + 1).map((cells, i) => cells[row]!.left - members[start + i]!.offset)),
        right: Math.max(...rows.slice(start, end + 1).map((cells, i) => members[start + i]!.offset + cells[row]!.right)),
        afterStretch: rows[end]![row]!.afterStretch,
        after: rows[end]![row]!.after, afterStiffness: rows[end]![row]!.afterStiffness, afterCollision: rows[end]![row]!.afterCollision,
      })) })
      start = end + 1
    }
    const solved = solveNativeSpacing(groups, width, justify, fillEdges)
    return { positions: members.map(member => solved.positions[member.group]! + member.offset), naturalWidth: solved.naturalWidth }
  }
  const positions: number[] = [], ends = lanes.map(() => 0)
  rows.forEach(row => {
    const position = Math.max(...row.map((cell, lane) => ends[lane]! + cell.left + cell.before))
    positions.push(position)
    row.forEach((cell, lane) => { ends[lane] = position + cell.right + cell.after })
  })
  const naturalWidth = Math.max(...ends)
  if (naturalWidth > width) {
    // The shared-column Hessian is tridiagonal: only neighbours interact.
    // Newton steps therefore take linear space and time per iteration.
    positions.forEach((position, index) => { positions[index] = position * width / naturalWidth })
    for (let iteration = 0; iteration < 100; iteration++) {
      const forces = positions.map(() => 0), edges = Array<number>(positions.length + 1).fill(0)
      const compressed = (distance: number, rest: number, stiffness: number, collision: number) => distance >= rest
        ? { force: 0, stiffness: 0 }
        : distance >= 0 ? { force: (rest - distance) * stiffness, stiffness }
          : { force: rest * stiffness - distance * collision, stiffness: collision }
      for (let lane = 0; lane < lanes.length; lane++) {
        const first = rows[0]![lane]!, last = rows.at(-1)![lane]!
        const left = compressed(positions[0]! - first.left, first.before, first.beforeStiffness, first.beforeCollision * 32)
        const right = compressed(width - positions.at(-1)! - last.right, last.after, last.afterStiffness, last.afterCollision * 32)
        forces[0]! += left.force; edges[0]! += left.stiffness
        forces[forces.length - 1]! -= right.force; edges[edges.length - 1]! += right.stiffness
        for (let index = 1; index < rows.length; index++) {
          const previous = rows[index - 1]![lane]!, current = rows[index]![lane]!
          const rest = previous.after + current.before
          const stiffness = previous.afterStiffness * current.beforeStiffness / (previous.afterStiffness + current.beforeStiffness)
          const collision = previous.afterCollision * current.beforeCollision / (previous.afterCollision + current.beforeCollision)
          const spring = compressed(positions[index]! - positions[index - 1]! - previous.right - current.left, rest, stiffness, collision)
          forces[index - 1]! -= spring.force; forces[index]! += spring.force; edges[index]! += spring.stiffness
        }
      }
      if (Math.max(...forces.map(Math.abs)) < 0.01) break
      const diagonal = positions.map((_, index) => edges[index]! + edges[index + 1]! + 0.0001)
      const delta = [...forces]
      for (let index = 1; index < positions.length; index++) {
        const factor = -edges[index]! / diagonal[index - 1]!
        diagonal[index]! += factor * edges[index]!
        delta[index]! -= factor * delta[index - 1]!
      }
      delta[delta.length - 1]! /= diagonal.at(-1)!
      for (let index = positions.length - 2; index >= 0; index--) delta[index] = (delta[index]! + edges[index + 1]! * delta[index + 1]!) / diagonal[index]!
      positions.forEach((position, index) => { positions[index] = position + 0.6 * delta[index]! })
    }
  }
  if (justify && width !== Infinity) {
    const left = Math.max(...rows[0]!.map(cell => cell.left)), right = Math.max(...rows.at(-1)!.map(cell => cell.right))
    const occupied = positions.at(-1)! + right - positions[0]! + left
    const shift = left - positions[0]!, free = width - occupied
    const cumulative = [free > 0 && fillEdges.left ? 1 : 0]
    for (let index = 1; index < positions.length; index++) {
      const weight = free > 0 ? Math.max(...rows[index]!.map((cell, lane) =>
        ((rows[index - 1]![lane]!.afterStretch ?? 1) + (cell.beforeStretch ?? 1)) / 2)) : 1
      cumulative.push(cumulative[index - 1]! + weight)
    }
    const total = cumulative.at(-1)! + (free > 0 && fillEdges.right ? 1 : 0)
    positions.forEach((position, index) => { positions[index] = position + shift + (total > 0 ? free * cumulative[index]! / total : 0) })
  }
  return { positions, naturalWidth }
}
