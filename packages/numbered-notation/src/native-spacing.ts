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
  /** Music reservation before voice-local lyrics and parentheses are added. */
  placeholderLeft?: number
  placeholderRight?: number
}
export type SpacingColumn = { cells: SpacingCell[]; fixedAfter?: number }
export type SpacingSolution = { positions: number[]; minimumWidth: number; stretchWeight: number }

/**
 * Place columns at their minimum clearances, then distribute positive surplus.
 * Each voice contributes constraints to the same time-column coordinates.
 * This is deliberately independent of source syntax, SVG and music objects.
 * fillEdges gives free bar-adjacent boundaries weight 1 in positive justification.
 */
export function solveNativeSpacing(columns: readonly SpacingColumn[], width = Infinity, justify = false, fillEdges: { left?: boolean; right?: boolean } = {}): SpacingSolution {
  if (!columns.length) return { positions: [], minimumWidth: 0, stretchWeight: 0 }
  if (width !== Infinity && (!Number.isFinite(width) || width <= 0)) throw new Error('音符排版宽度必须为正数。')
  const lanes = [...new Set(columns.flatMap(column => column.cells.map(cell => cell.lane)))]
  const sparse = new Set(columns.flatMap(column => column.cells.filter(cell => cell.sparse).map(cell => cell.lane)))
  const rows = columns.map(column => {
    const maxLeft = Math.max(0, ...column.cells.filter(cell => !cell.sparse).map(cell => cell.placeholderLeft ?? cell.left))
    const maxRight = Math.max(0, ...column.cells.filter(cell => !cell.sparse).map(cell => cell.placeholderRight ?? cell.right))
    return lanes.map(lane => {
      const found = column.cells.find(cell => cell.lane === lane)
      if (found) return { ...found, active: true }
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
        const occupied = rows.slice(start, end + 1).flatMap((cells, i) => cells[row]!.active ? [{ cell: cells[row]!, offset: members[start + i]!.offset }] : [])
        if (!occupied.length) return []
        return [{
          ...occupied[0]!.cell, lane,
          left: Math.max(...occupied.map(({ cell, offset }) => cell.left - offset)),
          right: Math.max(...occupied.map(({ cell, offset }) => offset + cell.right)),
          afterStretch: occupied.at(-1)!.cell.afterStretch,
          after: occupied.at(-1)!.cell.after,
        }]
      }) })
      start = end + 1
    }
    const solved = solveNativeSpacing(groups, width, justify, fillEdges)
    return { ...solved, positions: members.map(member => solved.positions[member.group]! + member.offset) }
  }
  const positions: number[] = [], ends = lanes.map(() => 0)
  rows.forEach(row => {
    const position = Math.max(...row.map((cell, lane) => cell.active ? ends[lane]! + cell.left + cell.before : 0))
    positions.push(position)
    row.forEach((cell, lane) => { if (cell.active) ends[lane] = position + cell.right + cell.after })
  })
  const minimumWidth = Math.max(...ends)
  const cumulative = [fillEdges.left ? 1 : 0]
  for (let index = 1; index < positions.length; index++) {
    const weight = Math.max(...rows[index]!.map((cell, lane) =>
      ((rows[index - 1]![lane]!.afterStretch ?? 1) + (cell.beforeStretch ?? 1)) / 2))
    cumulative.push(cumulative[index - 1]! + weight)
  }
  const stretchWeight = cumulative.at(-1)! + (fillEdges.right ? 1 : 0)
  if (justify && width !== Infinity) {
    const left = Math.min(...rows.flatMap((row, i) => row.filter(cell => cell.active).map(cell => positions[i]! - cell.left)))
    const right = Math.max(...rows.flatMap((row, i) => row.filter(cell => cell.active).map(cell => positions[i]! + cell.right)))
    const occupied = right - left
    const shift = -left, free = Math.max(0, width - occupied)
    positions.forEach((position, index) => { positions[index] = position + shift + (stretchWeight > 0 ? free * cumulative[index]! / stretchWeight : 0) })
  }
  return { positions, minimumWidth, stretchWeight }
}
