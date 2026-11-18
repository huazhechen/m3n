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
  const rows = columns.map(column => {
    const maxLeft = Math.max(0, ...column.cells.map(cell => cell.placeholderLeft ?? cell.left))
    const maxRight = Math.max(0, ...column.cells.map(cell => cell.placeholderRight ?? cell.right))
    return lanes.map(lane => column.cells.find(cell => cell.lane === lane) ?? {
      lane, left: 0, right: 0, before: maxLeft, after: maxRight,
      beforeStretch: 0, afterStretch: 0,
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
        after: rows[end]![row]!.after,
      })) })
      start = end + 1
    }
    const solved = solveNativeSpacing(groups, width, justify, fillEdges)
    return { ...solved, positions: members.map(member => solved.positions[member.group]! + member.offset) }
  }
  const positions: number[] = [], ends = lanes.map(() => 0)
  rows.forEach(row => {
    const position = Math.max(...row.map((cell, lane) => ends[lane]! + cell.left + cell.before))
    positions.push(position)
    row.forEach((cell, lane) => { ends[lane] = position + cell.right + cell.after })
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
    const left = Math.max(...rows[0]!.map(cell => cell.left)), right = Math.max(...rows.at(-1)!.map(cell => cell.right))
    const occupied = positions.at(-1)! + right - positions[0]! + left
    const shift = left - positions[0]!, free = Math.max(0, width - occupied)
    positions.forEach((position, index) => { positions[index] = position + shift + (stretchWeight > 0 ? free * cumulative[index]! / stretchWeight : 0) })
  }
  return { positions, minimumWidth, stretchWeight }
}
