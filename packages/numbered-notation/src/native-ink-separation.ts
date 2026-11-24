import type { NativeInk } from './native-ink.js'

/** Maximum vertical separation of horizontally intersecting ink. Both inputs
 * are sorted by left edge. Sweep starts, discarding expired heap leaders;
 * only the highest upper bottom / lowest lower top can constrain placement. */
export function sortedNativeInkSeparation(upper: readonly NativeInk[], lower: readonly NativeInk[]): number {
  const high: NativeInk[] = [], low: NativeInk[] = []
  const priority = (ink: NativeInk, highest: boolean) => highest ? ink.bottom : -ink.top
  const push = (heap: NativeInk[], ink: NativeInk, highest: boolean) => {
    let index = heap.length
    heap.push(ink)
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (priority(heap[parent]!, highest) >= priority(ink, highest)) break
      heap[index] = heap[parent]!; index = parent
    }
    heap[index] = ink
  }
  const discardExpired = (heap: NativeInk[], x: number, highest: boolean) => {
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
      push(high, ink, true)
    } else {
      const ink = lower[j++]!
      if (ink.right <= ink.left) continue
      discardExpired(high, ink.left, true)
      if (high.length) distance = Math.max(distance, high[0]!.bottom - ink.top)
      push(low, ink, false)
    }
  }
  return distance
}
