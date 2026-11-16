/** Geometry consumed by the project-owned horizontal solver. All units are px. */
export type SpacingCell = {
  lane: string
  left: number
  right: number
  before: number
  after: number
  /** Compression stiffness of the two elastic clearances. */
  beforeStiffness: number
  afterStiffness: number
  /** Penalty for intruding into physical ink or reserved lyric space. */
  beforeCollision: number
  afterCollision: number
}
export type SpacingColumn = { cells: SpacingCell[] }
export type SpacingSolution = { positions: number[]; naturalWidth: number }

/**
 * Minimise a chain's convex, piecewise-quadratic compression energy.
 * Each voice contributes constraints to the same time-column coordinates.
 * This is deliberately independent of source syntax, SVG and music objects.
 */
export function solveNativeSpacing(columns: readonly SpacingColumn[], width = Infinity, justify = false): SpacingSolution {
  if (!columns.length) return { positions: [], naturalWidth: 0 }
  if (width !== Infinity && (!Number.isFinite(width) || width <= 0)) throw new Error('音符排版宽度必须为正数。')
  const lanes = [...new Set(columns.flatMap(column => column.cells.map(cell => cell.lane)))]
  const rows = columns.map(column => {
    const maxLeft = Math.max(0, ...column.cells.map(cell => cell.left)), maxRight = Math.max(0, ...column.cells.map(cell => cell.right))
    return lanes.map(lane => column.cells.find(cell => cell.lane === lane) ?? {
      lane, left: 0, right: 0, before: maxLeft, after: maxRight,
      beforeStiffness: maxLeft ? 1 / maxLeft : 1e6, afterStiffness: maxRight ? 1 / maxRight : 1e6,
      beforeCollision: 16, afterCollision: 16,
    })
  })
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
    positions.forEach((position, index) => { positions[index] = position + shift + (positions.length > 1 ? free * index / (positions.length - 1) : 0) })
  }
  return { positions, naturalWidth }
}
