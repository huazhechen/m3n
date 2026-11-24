import { expect, it } from 'vitest'
import type { NativeArcCommand } from './native-arc.js'
import type { NativeInk } from './native-ink.js'
import { nativeArcSlice, nativeArcInkLift, nativeRibbonRange } from './native-curve.js'

// Unfiltered reference: every overlapping primitive gets exact curve slices.
function unfilteredLift(commands: NativeArcCommand[], left: number, right: number, pieces: NativeInk[], initial: number) {
  const middle = (left + right) / 2
  const obstacles = pieces.flatMap(piece => {
    const a = Math.max(left, piece.left), b = Math.min(right, piece.right)
    if (b - a < 1e-8) return []
    const edges = [a, b, ...(middle > a && middle < b ? [middle] : [])]
      .flatMap(x => { const slice = nativeArcSlice(commands, x); return slice ? [slice] : [] })
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

it('matches unfiltered clearance with initial lifts, exposed obstacles, both directions and varied control hulls', () => {
  let seed = 7159
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  for (let trial = 0; trial < 150; trial++) {
    const left = random() * 100 - 50, right = left + 10 + random() * 300, y = random() * 200 - 100
    const first = trial % 2 ? right : left, last = trial % 2 ? left : right
    const commands: NativeArcCommand[] = [{ op: 'M', x: first, y }]
    if (trial % 3 === 0) commands.push({ op: 'C', cx1: first + (last - first) / 4, cy1: y - random() * 50,
      cx2: last - (last - first) / 4, cy2: y + random() * 20, x: last, y })
    else if (trial % 3 === 1) commands.push({ op: 'Q', cx: (left + right) / 2, cy: y - random() * 60, x: last, y })
    else commands.push({ op: 'L', x: last, y })
    commands.push({ op: 'L', x: first, y: y + 2 }, { op: 'Z' })
    const pieces = Array.from({ length: 20 }, () => {
      const x = left - 10 + random() * (right - left + 20), top = y - 70 + random() * 100
      return { left: x, right: x + random() * 30, top, bottom: top + random() * 20 }
    })
    const initial = trial % 5 === 0 ? -5 : random() * 20
    expect(nativeArcInkLift(commands, left, right, pieces, initial)).toBe(unfilteredLift(commands, left, right, pieces, initial))
    expect(nativeArcInkLift(commands, left, right, [...pieces].reverse(), initial)).toBe(unfilteredLift(commands, left, right, [...pieces].reverse(), initial))
  }
})

it('preserves the exact intersection tolerance near the hull at small and large coordinates', () => {
  for (const y of [0, -10, 1e8, -1e8]) for (const initial of [0, 2, -2]) {
    const commands: NativeArcCommand[] = [{ op: 'M', x: 0, y }, { op: 'L', x: 100, y },
      { op: 'L', x: 100, y: y + 2 }, { op: 'L', x: 0, y: y + 2 }, { op: 'Z' }]
    for (const offset of [-1e-6, -1e-7, 0, 1e-7, 1e-6]) {
      const top = y + 2 - initial + offset
      const pieces = [{ left: 20, right: 30, top, bottom: top + 1 }]
      expect(nativeArcInkLift(commands, 0, 100, pieces, initial)).toBe(unfilteredLift(commands, 0, 100, pieces, initial))
    }
  }
})

it.each([false, true])('matches analytic cubic ribbon edges and slopes in either direction, reverse=%s', reverse => {
  const end = reverse ? 0 : 96, start = 96 - end
  const first = reverse ? 64 : 32, second = 96 - first
  const commands: NativeArcCommand[] = [{ op: 'M', x: start, y: 0 },
    { op: 'C', cx1: first, cy1: -24, cx2: second, cy2: -24, x: end, y: 0 },
    { op: 'C', cx1: second, cy1: -16, cx2: first, cy2: -16, x: start, y: 0 }, { op: 'Z' }]
  for (const t of [0, .1, .25, .5, .75, .9, 1]) {
    const slice = nativeArcSlice(commands, 96 * t, true)!
    expect(slice.top).toBeCloseTo(-72 * t * (1 - t), 7)
    expect(slice.bottom).toBeCloseTo(-48 * t * (1 - t), 7)
    expect(slice.topSlope).toBeCloseTo(-.75 * (1 - 2 * t), 7)
    expect(slice.bottomSlope).toBeCloseTo(-.5 * (1 - 2 * t), 7)
  }
  expect(nativeArcSlice(commands, -1)).toBeUndefined()
  expect(nativeArcSlice(commands, 97)).toBeUndefined()
  expect(nativeRibbonRange({ commands, left: 0, right: 96 }, 24, 72)!.top).toBeCloseTo(-18, 7)
})

it('matches analytic quadratic edges without losing the actual obstacle clearance', () => {
  const commands: NativeArcCommand[] = [{ op: 'M', x: 0, y: 0 },
    { op: 'Q', cx: 50, cy: -20, x: 100, y: 0 },
    { op: 'Q', cx: 50, cy: -10, x: 0, y: 0 }, { op: 'Z' }]
  for (const t of [0, .1, .25, .5, .75, .9, 1]) {
    const slice = nativeArcSlice(commands, t * 100, true)!
    expect(slice.top).toBeCloseTo(-40 * t * (1 - t), 7)
    expect(slice.bottom).toBeCloseTo(-20 * t * (1 - t), 7)
    expect(slice.topSlope).toBeCloseTo(-.4 * (1 - 2 * t), 7)
    expect(slice.bottomSlope).toBeCloseTo(-.2 * (1 - 2 * t), 7)
  }
  const flat: NativeArcCommand[] = [{ op: 'M', x: 0, y: -10 }, { op: 'L', x: 100, y: -10 },
    { op: 'L', x: 100, y: -5 }, { op: 'L', x: 0, y: -5 }, { op: 'Z' }]
  expect(nativeArcInkLift(flat, 0, 100, [{ left: 20, right: 30, top: -7, bottom: -3 }])).toBe(2)
  expect(nativeArcInkLift(flat, 0, 100, [{ left: 20, right: 30, top: -15, bottom: -11 }])).toBe(0)
})
