import type { ScoreInk } from './geometry.js'

type HorizontalProxy = { source: readonly ScoreInk[]; left:number; nextLeft:number; scale:number; dy:number }
let hasHorizontalProxies = false
const horizontalProxies = new WeakMap<readonly ScoreInk[],HorizontalProxy>()
const proxySources = new WeakMap<readonly ScoreInk[],ScoreInk[]>()
const proxySeparations = new WeakMap<readonly ScoreInk[],WeakMap<readonly ScoreInk[],number>>()
export function cacheScoreHorizontalProxy(ink: readonly ScoreInk[], source: readonly ScoreInk[], left:number, nextLeft:number, scale:number) {
  let sorted = proxySources.get(source)
  if (!sorted) { sorted = [...source].sort((a,b)=>a.left-b.left); proxySources.set(source,sorted); cacheScoreInkSeparation(sorted) }
  hasHorizontalProxies = true
  horizontalProxies.set(ink,{source:sorted,left,nextLeft,scale,dy:0})
}
export function inheritScoreHorizontalProxy(source:readonly ScoreInk[], next:readonly ScoreInk[], dy:number) {
  if (!hasHorizontalProxies) return
  const saved = horizontalProxies.get(source)
  if (saved) horizontalProxies.set(next,{...saved,dy:saved.dy+dy})
}

/** Maximum vertical separation of horizontally intersecting ink. Both inputs
 * are sorted by left edge. Sweep starts, discarding expired heap leaders;
 * only the highest upper bottom / lowest lower top can constrain placement. */
export function sortedScoreInkSeparation(upper: readonly ScoreInk[], lower: readonly ScoreInk[]): number {
  if (!upper.length || !lower.length) return -Infinity
  const transformedUpper = hasHorizontalProxies && horizontalProxies.get(upper), transformedLower = hasHorizontalProxies && horizontalProxies.get(lower)
  if (transformedUpper && transformedLower && transformedUpper.scale>0
    && transformedUpper.scale===transformedLower.scale && transformedUpper.left===transformedLower.left && transformedUpper.nextLeft===transformedLower.nextLeft) {
    let pairs = proxySeparations.get(transformedUpper.source)
    let distance = pairs?.get(transformedLower.source)
    if (distance===undefined) {
      distance=sortedScoreInkSeparation(transformedUpper.source,transformedLower.source)
      if (!pairs) {pairs=new WeakMap();proxySeparations.set(transformedUpper.source,pairs)}
      pairs.set(transformedLower.source,distance)
    }
    return distance+transformedUpper.dy-transformedLower.dy
  }
  const a = contours.get(upper), b = contours.get(lower)
  if (a && b) {
    a.bottomUses++; b.topUses++
    // One-off pairs are cheaper as a direct sweep. Compile a direction's
    // exact contour only when it is reused against another neighbour.
    if (a.bottomUses > 1 && b.topUses > 1) return contourSeparation(contour(upper, false), contour(lower, true))
  }
  // A header or a single fixed rule needs no active heap at all. Keep the
  // same strict overlap test, including infinite spans and zero-width ink.
  if (upper.length === 1 || lower.length === 1) {
    const singleUpper = upper.length === 1, fixed = singleUpper ? upper[0]! : lower[0]!
    if (fixed.right <= fixed.left) return -Infinity
    let distance = -Infinity
    for (const piece of singleUpper ? lower : upper) {
      if (piece.left >= fixed.right) break
      if (piece.right <= piece.left || piece.right <= fixed.left) continue
      distance = Math.max(distance, singleUpper ? fixed.bottom - piece.top : piece.bottom - fixed.top)
    }
    return distance
  }
  const high: ScoreInk[] = [], low: ScoreInk[] = []
  const priority = (ink: ScoreInk, highest: boolean) => highest ? ink.bottom : -ink.top
  const push = (heap: ScoreInk[], ink: ScoreInk, highest: boolean) => {
    let index = heap.length
    heap.push(ink)
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (priority(heap[parent]!, highest) >= priority(ink, highest)) break
      heap[index] = heap[parent]!; index = parent
    }
    heap[index] = ink
  }
  const discardExpired = (heap: ScoreInk[], x: number, highest: boolean) => {
    while (heap.length && heap[0]!.right <= x) {
      const last = heap.pop()!
      if (!heap.length) break
      let index = 0
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1
        if (child + 1 < heap.length && priority(heap[child + 1]!, highest) > priority(heap[child]!, highest)) child++
        if (priority(last, highest) >= priority(heap[child]!, highest)) break
        heap[index] = heap[child]!; index = child
      }
      heap[index] = last
    }
  }
  let i = 0, j = 0, distance = -Infinity
  while (i < upper.length || j < lower.length) {
    if (i < upper.length && (j === lower.length || upper[i]!.left <= lower[j]!.left)) {
      const ink = upper[i++]!
      if (ink.right <= ink.left) continue
      discardExpired(low, ink.left, false)
      if (low.length) distance = Math.max(distance, ink.bottom - low[0]!.top)
      else if (j === lower.length) break
      // Once every lower interval has started, only its active heap can
      // intersect later upper ink. No future lower start can query this heap.
      if (j < lower.length) push(high, ink, true)
    } else {
      const ink = lower[j++]!
      if (ink.right <= ink.left) continue
      discardExpired(high, ink.left, true)
      if (high.length) distance = Math.max(distance, high[0]!.bottom - ink.top)
      else if (i === upper.length) break
      if (i < upper.length) push(low, ink, false)
    }
  }
  return distance
}

// Only internally normalized geometry opts in. Public callers may pass mutable
// arrays, and still receive a fresh sweep on every call.
type Run = { left: number; right: number; value: number }
type CachedContours = { top?: Run[]; bottom?: Run[]; topUses: number; bottomUses: number }
const contours = new WeakMap<readonly ScoreInk[], CachedContours>()
export function cacheScoreInkSeparation(ink: readonly ScoreInk[]): void {
  if (!contours.has(ink)) contours.set(ink, {topUses:0,bottomUses:0})
}
export function hasCachedScoreInkSeparation(ink: readonly ScoreInk[]): boolean { return contours.has(ink) }

/** Exact extremal contour, with changes only at real primitive edges. A row
 * reused against several neighbours no longer rebuilds the same active heap. */
function contour(ink: readonly ScoreInk[], top: boolean): Run[] {
  let saved = contours.get(ink)
  if (!saved) { saved = {topUses:0,bottomUses:0}; contours.set(ink, saved) }
  const key = top ? 'top' : 'bottom'
  if (saved[key]) return saved[key]
  const result: Run[] = [], heap: ScoreInk[] = []
  const value = (piece: ScoreInk) => top ? piece.top : piece.bottom
  const higher = (a: ScoreInk, b: ScoreInk) => top ? value(a) < value(b) : value(a) > value(b)
  const push = (piece: ScoreInk) => {
    let at = heap.length
    heap.push(piece)
    while (at) {
      const parent = (at - 1) >> 1
      if (!higher(piece, heap[parent]!)) break
      heap[at] = heap[parent]!; at = parent
    }
    heap[at] = piece
  }
  const expire = (x: number) => {
    while (heap.length && heap[0]!.right <= x) {
      const last = heap.pop()!
      if (!heap.length) break
      let at = 0
      while (at * 2 + 1 < heap.length) {
        let child = at * 2 + 1
        if (child + 1 < heap.length && higher(heap[child + 1]!, heap[child]!)) child++
        if (!higher(heap[child]!, last)) break
        heap[at] = heap[child]!; at = child
      }
      heap[at] = last
    }
  }
  let at = 0, x = ink[0]?.left ?? 0
  while (at < ink.length || heap.length) {
    if (!heap.length && at < ink.length) x = ink[at]!.left
    while (at < ink.length && ink[at]!.left <= x) {
      const piece = ink[at++]!
      if (piece.right > piece.left) push(piece)
    }
    expire(x)
    if (!heap.length) continue
    const right = Math.min(heap[0]!.right, at < ink.length ? ink[at]!.left : Infinity)
    const y = value(heap[0]!), prior = result.at(-1)
    if (prior && prior.right === x && prior.value === y) prior.right = right
    else result.push({ left: x, right, value: y })
    x = right
  }
  return saved[key] = result
}
function contourSeparation(upper: readonly Run[], lower: readonly Run[]): number {
  let i = 0, j = 0, distance = -Infinity
  while (i < upper.length && j < lower.length) {
    const a = upper[i]!, b = lower[j]!
    if (Math.min(a.right, b.right) > Math.max(a.left, b.left)) distance = Math.max(distance, a.value - b.value)
    if (a.right <= b.right) i++
    if (b.right <= a.right) j++
  }
  return distance
}
