import { expect, it } from 'vitest'
import type { NativeArcCommand } from './native-arc.js'
import { nativeArcSlice, nativeArcInkLift, nativeRibbonRange } from './native-curve.js'

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
