import { expect, it } from 'vitest'
import { line } from './native-symbols.js'

it.each([.123456789, -.123456789, 1234.56789123])('preserves subpixel line geometry at %s', coordinate => {
  const svg = line(coordinate, coordinate, coordinate + 1, coordinate + 2, .123456789)
  for (const [name, expected] of Object.entries({ x1: coordinate, y1: coordinate, x2: coordinate + 1, y2: coordinate + 2, 'stroke-width': .123456789 })) {
    const actual = Number(new RegExp(` ${name}="([^"]+)"`).exec(svg)![1])
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(.000000501)
  }
})
