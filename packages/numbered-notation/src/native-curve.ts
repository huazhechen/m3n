import type { NativeArcCommand } from './native-arc.js'

type Point = { x: number; y: number }

/** Bernstein coefficients for the linear, quadratic and cubic edges we draw. */
function curvePoint(points: Point[], t: number): Point {
  const u = 1 - t
  const weights = points.length === 2 ? [u, t] : points.length === 3 ? [u * u, 2 * u * t, t * t]
    : [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3]
  let x = 0, y = 0
  for (let index = 0; index < points.length; index++) { x += points[index]!.x * weights[index]!; y += points[index]!.y * weights[index]! }
  return { x, y }
}

/** Vertical slice of a closed ribbon whose individual edges are monotone in x.
 * Includes both edges and vertical joins, independent of drawing direction.
 */
export function nativeArcSlice(commands: readonly NativeArcCommand[], x: number) {
  let cursor: Point = { x: 0, y: 0 }
  const heights: number[] = []
  for (const command of commands) {
    if (command.op === 'Z') continue
    if (command.op === 'M') { cursor = command; continue }
    const start = cursor
    cursor = command
    if (x < Math.min(start.x, command.x) - 1e-8 || x > Math.max(start.x, command.x) + 1e-8) continue
    if (Math.abs(start.x - command.x) < 1e-8) {
      heights.push(start.y, command.y)
      continue
    }
    const points = command.op === 'C' ? [start, { x: command.cx1, y: command.cy1 }, { x: command.cx2, y: command.cy2 }, command]
      : command.op === 'Q' ? [start, { x: command.cx, y: command.cy }, command] : [start, command]
    let low = 0, high = 1
    const forward = start.x < command.x
    for (let iteration = 0; iteration < 32; iteration++) {
      const t = (low + high) / 2
      if ((curvePoint(points, t).x < x) === forward) low = t
      else high = t
    }
    heights.push(curvePoint(points, (low + high) / 2).y)
  }
  return heights.length ? { top: Math.min(...heights), bottom: Math.max(...heights) } : undefined
}
