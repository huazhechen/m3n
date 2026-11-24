import type { NativeArcCommand } from './native-arc.js'
import type { NativeInk } from './native-ink.js'

type Point = { x: number; y: number }

/** Bernstein coefficients for the linear, quadratic and cubic edges we draw. */
function curveCoordinate(points: Point[], t: number, coordinate: 'x' | 'y'): number {
  const u = 1 - t
  // Preserve the original Bernstein evaluation order, computing only the
  // coordinate requested by the inverse search. No weights or point objects.
  let value = 0
  if (points.length === 2) {
    value += points[0]![coordinate] * u
    value += points[1]![coordinate] * t
  } else if (points.length === 3) {
    value += points[0]![coordinate] * (u * u)
    value += points[1]![coordinate] * (2 * u * t)
    value += points[2]![coordinate] * (t * t)
  } else {
    value += points[0]![coordinate] * (u ** 3)
    value += points[1]![coordinate] * (3 * u * u * t)
    value += points[2]![coordinate] * (3 * u * t * t)
    value += points[3]![coordinate] * (t ** 3)
  }
  return value
}

/** Vertical slice of a closed ribbon whose individual edges are monotone in x.
 * Includes both edges and vertical joins, independent of drawing direction.
 */
export function nativeArcSlice(commands: readonly NativeArcCommand[], x: number, slopes = false) {
  let cursor: Point = { x: 0, y: 0 }
  const edges: { y: number; slope: number }[] = []
  for (const command of commands) {
    if (command.op === 'Z') continue
    if (command.op === 'M') { cursor = command; continue }
    const start = cursor
    cursor = command
    if (x < Math.min(start.x, command.x) - 1e-8 || x > Math.max(start.x, command.x) + 1e-8) continue
    if (Math.abs(start.x - command.x) < 1e-8) {
      edges.push({ y: start.y, slope: 0 }, { y: command.y, slope: 0 })
      continue
    }
    const points = command.op === 'C' ? [start, { x: command.cx1, y: command.cy1 }, { x: command.cx2, y: command.cy2 }, command]
      : command.op === 'Q' ? [start, { x: command.cx, y: command.cy }, command] : [start, command]
    let low = 0, high = 1
    const forward = start.x < command.x
    for (let iteration = 0; iteration < 32; iteration++) {
      const t = (low + high) / 2
      if ((curveCoordinate(points, t, 'x') < x) === forward) low = t
      else high = t
    }
    const t = x === start.x ? 0 : x === command.x ? 1 : (low + high) / 2
    if (!slopes) { edges.push({ y: curveCoordinate(points, t, 'y'), slope: 0 }); continue }
    const degree = points.length - 1
    const derivatives = points.slice(1).map((point, i) => ({ x: degree * (point.x - points[i]!.x), y: degree * (point.y - points[i]!.y) }))
    const dx = derivatives.length === 1 ? derivatives[0]!.x : curveCoordinate(derivatives, t, 'x')
    const dy = derivatives.length === 1 ? derivatives[0]!.y : curveCoordinate(derivatives, t, 'y')
    edges.push({ y: curveCoordinate(points, t, 'y'), slope: dy / dx })
  }
  if (!edges.length) return undefined
  const top = Math.min(...edges.map(edge => edge.y)), bottom = Math.max(...edges.map(edge => edge.y))
  if (!slopes) return { top, bottom, topSlope: 0, bottomSlope: 0 }
  const xs = commands.flatMap(command => command.op === 'Z' ? [] : [command.x])
  const onLeft = x <= (Math.min(...xs) + Math.max(...xs)) / 2
  const topSlopes = edges.filter(edge => Math.abs(edge.y - top) < 1e-9).map(edge => edge.slope)
  const bottomSlopes = edges.filter(edge => Math.abs(edge.y - bottom) < 1e-9).map(edge => edge.slope)
  return { top, bottom, topSlope: onLeft ? Math.min(...topSlopes) : Math.max(...topSlopes),
    bottomSlope: onLeft ? Math.max(...bottomSlopes) : Math.min(...bottomSlopes) }
}

/** Lift only when a real primitive intersects the ribbon. A side component
 * already wholly above it can stay there; moving past one component can expose
 * another, so resolve the finite set of candidate clearances to a fixed point. */
export function nativeArcInkLift(commands: readonly NativeArcCommand[], left: number, right: number, pieces: readonly NativeInk[], initial = 0): number {
  const middle = (left + right) / 2
  // A Bezier stays inside the convex hull of its control points. Obstacles
  // wholly below that hull cannot meet this ribbon, even after further lifts.
  // Keep a rounding allowance; this is only a conservative broad phase.
  let bottomBound = -Infinity, magnitude = Math.abs(initial)
  for (const command of commands) {
    if (command.op === 'Z') continue
    const ys = command.op === 'C' ? [command.y, command.cy1, command.cy2]
      : command.op === 'Q' ? [command.y, command.cy] : [command.y]
    for (const y of ys) { bottomBound = Math.max(bottomBound, y); magnitude = Math.max(magnitude, Math.abs(y)) }
  }
  const below = bottomBound - initial + magnitude * Number.EPSILON * 32
  const obstacles = pieces.flatMap(piece => {
    if (piece.top + 1e-7 >= below) return []
    const a = Math.max(left, piece.left), b = Math.min(right, piece.right)
    if (b - a < 1e-8) return []
    const edges = [a, b, ...(middle > a && middle < b ? [middle] : [])].flatMap(x => {
      const slice = nativeArcSlice(commands, x)
      return slice ? [slice] : []
    })
    return edges.length ? [{ piece, top: Math.min(...edges.map(e => e.top)), bottom: Math.max(...edges.map(e => e.bottom)) }] : []
  })
  let lift = initial
  for (let pass = 0; pass < obstacles.length; pass++) {
    const previous = lift
    for (const { piece, top, bottom } of obstacles) {
      if (bottom - lift > piece.top + 1e-7 && top - lift < piece.bottom - 1e-7) lift = Math.max(lift, bottom - piece.top)
    }
    if (lift === previous) break
  }
  return lift
}

export type NativeRibbon = { commands: readonly NativeArcCommand[]; left: number; right: number }

/** Our bows have a single y extremum at the horizontal midpoint; opening,
 * closing and plateau edges are monotone. Thus the ends and that extremum
 * give exact interval bounds, independent of viewport width. */
export function nativeRibbonRange(ribbon: NativeRibbon, left: number, right: number) {
  const a = Math.max(left, ribbon.left), b = Math.min(right, ribbon.right)
  if (a > b) return undefined
  const middle = (ribbon.left + ribbon.right) / 2
  const slices = [a, b, ...(middle > a && middle < b ? [middle] : [])]
    .flatMap(x => { const slice = nativeArcSlice(ribbon.commands, x); return slice ? [slice] : [] })
  return slices.length ? { top: Math.min(...slices.map(s => s.top)), bottom: Math.max(...slices.map(s => s.bottom)) } : undefined
}

/** Bound the maximum difference between the real facing edges. Each interval
 * has a certified upper bound from its curve extrema; refine only intervals
 * that can improve the maximum. No screen-pixel sampling or extra lift. */
export function nativeRibbonClearance(outer: NativeRibbon, inner: NativeRibbon, gap: number, precision: number) {
  const left = Math.max(outer.left, inner.left), right = Math.min(outer.right, inner.right)
  if (right <= left) return 0
  const pending = [[left, right]]
  let best = 0, bound = 0
  while (pending.length) {
    const [a, b] = pending.pop()!, middle = (a! + b!) / 2
    for (const x of [a!, middle, b!]) {
      const outside = nativeArcSlice(outer.commands, x), inside = nativeArcSlice(inner.commands, x)
      if (outside && inside) best = Math.max(best, outside.bottom - inside.top + gap)
    }
    const outside = nativeRibbonRange(outer, a!, b!), inside = nativeRibbonRange(inner, a!, b!)
    if (!outside || !inside) continue
    let upper = outside.bottom - inside.top + gap
    const al = nativeArcSlice(outer.commands, a!, true)!, ar = nativeArcSlice(outer.commands, b!, true)!
    const bl = nativeArcSlice(inner.commands, a!, true)!, br = nativeArcSlice(inner.commands, b!, true)!
    // Both facing edges are convex, so their derivative bounds are given by
    // interval endpoints. Prove monotonic intervals or tighten the envelope
    // near a stationary point instead of subdividing broad flat spans.
    const lowSlope = al.bottomSlope - br.topSlope, highSlope = ar.bottomSlope - bl.topSlope
    const first = al.bottom - bl.top + gap, last = ar.bottom - br.top + gap
    if (lowSlope >= 0) upper = Math.min(upper, last)
    else if (highSlope <= 0) upper = Math.min(upper, first)
    else upper = Math.min(upper, first + highSlope * (b! - a!), last - lowSlope * (b! - a!))
    if (upper <= best + precision || middle === a || middle === b) bound = Math.max(bound, upper)
    else pending.push([a!, middle], [middle, b!])
  }
  return Math.max(best, bound)
}
