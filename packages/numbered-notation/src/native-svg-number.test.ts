import { expect, it } from 'vitest'
import { nativeSvgNumber } from './native-svg-number.js'

it('preserves decimal quantization, including adjacent floats, ties and signed zero', () => {
  const original = (value: number) => Number.isInteger(value) ? (value === 0 ? 0 : value) : Number(value.toFixed(6))
  const buffer = new ArrayBuffer(8), view = new DataView(buffer)
  const adjacent = (value: number, direction: bigint) => {
    view.setFloat64(0, value)
    view.setBigUint64(0, view.getBigUint64(0) + direction)
    return view.getFloat64(0)
  }
  const values = [0, -0, NaN, Infinity, -Infinity, Number.MIN_VALUE, -Number.MIN_VALUE, 1e21, 2 ** 51 / 1e6, 2 ** 52 / 1e6]
  let seed = 781
  for (let i = 0; i < 20_000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    for (const sign of [-1, 1]) for (const offset of [0, .5]) {
      const value = sign * (seed + offset) / 1e6
      values.push(value, adjacent(value, -1n), adjacent(value, 1n))
    }
  }
  for (const value of values) expect(nativeSvgNumber(value)).toBe(original(value))
})
