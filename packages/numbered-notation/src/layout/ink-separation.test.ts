import { describe, expect, it } from 'vitest'
import { sortedScoreInkSeparation, cacheScoreInkSeparation } from './ink-separation.js'
import type { NativeInk } from '../native-ink.js'

const exhaustive = (upper: NativeInk[], lower: NativeInk[]) => {
  let distance = -Infinity
  for (const a of upper) for (const b of lower) if (Math.min(a.right, b.right) > Math.max(a.left, b.left)) distance = Math.max(distance, a.bottom - b.top)
  return distance
}
const compare = (upper: NativeInk[], lower: NativeInk[]) => {
  const a=[...upper].sort((a,b)=>a.left-b.left), b=[...lower].sort((a,b)=>a.left-b.left)
  const expected=exhaustive(upper,lower)
  expect(sortedScoreInkSeparation(a,b)).toBe(expected)
  cacheScoreInkSeparation(a);cacheScoreInkSeparation(b)
  expect(sortedScoreInkSeparation(a,b)).toBe(expected)
  expect(sortedScoreInkSeparation(a,b)).toBe(expected)
  expect(sortedScoreInkSeparation(b,a)).toBe(exhaustive(lower,upper))
}

describe('horizontal ink sweep for vertical pagination', () => {
  it('matches touching boundaries, nested spans, expired leaders and zero-width marks', () => {
    const upper = [
      { left: 0, right: 10, top: 0, bottom: 100 },
      { left: 1, right: 2, top: 0, bottom: 200 },
      { left: 20, right: 30, top: 0, bottom: 50 },
      { left: 25, right: 25, top: 0, bottom: 1000 },
    ]
    compare(upper, [
      { left: 10, right: 20, top: -1000, bottom: 0 },
      { left: 3, right: 25, top: -10, bottom: 0 },
      { left: 21, right: 22, top: -20, bottom: 0 },
      { left: 25, right: 25, top: -1000, bottom: 0 },
    ])
    compare([], upper); compare(upper, [])
  })
  it('matches exhaustive separation across randomized row pairs', () => {
    let seed = 98765
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
    const row = () => Array.from({ length: 80 }, () => {
      const left = random() * 500 - 100, top = random() * 50 - 25
      return { left, right: left + random() * 80, top, bottom: top + random() * 50 }
    })
    for (let i = 0; i < 100; i++) compare(row(), row())
  })
})

it('preserves infinite header spans and fresh results for mutable public arrays',()=>{
 const header=[{left:-Infinity,right:Infinity,top:0,bottom:30}]
 const row=[{left:10,right:20,top:-10,bottom:15},{left:15,right:25,top:-15,bottom:20}]
 compare(header,row);compare(row,header)
 expect(sortedScoreInkSeparation(header,row)).toBe(45)
 row[1]!.top=-30
 expect(sortedScoreInkSeparation(header,row)).toBe(60)
})


it('preserves late intersections behind expired leaders and ignores disjoint tails', () => {
  const tail = Array.from({ length: 200 }, (_, i) => ({
    left: 1000 + i * 3, right: 1002 + i * 3, top: -10000, bottom: 10000,
  }))
  const fixed = [
    { left: 0, right: 100, top: -10, bottom: 20 },
    { left: 1, right: 2, top: -100, bottom: 200 },
  ]
  for (const last of [2, 99, 100, 101]) compare(fixed, [
    { left: last, right: last + 1, top: 0, bottom: 5 }, ...tail,
  ])
  compare(fixed, tail)
  compare(tail, fixed)
})


it('matches exhaustive single-interval queries with finite and unbounded spans', () => {
  const row = [
    { left: -20, right: -10, top: -12, bottom: 30 },
    { left: 0, right: 10, top: -8, bottom: 17 },
    { left: 5, right: 5, top: -1000, bottom: 1000 },
    { left: 10, right: 20, top: -15, bottom: 25 },
  ]
  for (const [left, right] of [[-Infinity, Infinity], [-10, 0], [0, 0], [5, 12], [20, 30]]) {
    const single = [{ left: left!, right: right!, top: -4, bottom: 11 }]
    compare(single, row); compare(row, single); compare(single, single)
  }
})

it('reuses immutable row extrema for changing full-span headers with exact single-sweep parity', () => {
  const row = [
    { left: -Infinity, right: -2, top: -0, bottom: 12.125 },
    { left: -1, right: 3, top: -17.375, bottom: 0 },
    { left: 0, right: 0, top: -1000, bottom: 1000 },
    { left: 4, right: Infinity, top: 0, bottom: 22.5 },
    { left: Infinity, right: Infinity, top: -2000, bottom: 2000 },
  ]
  cacheScoreInkSeparation(row)
  for (const offset of [0, 17.25, -3.125, 1e100, 0]) {
    const header = [{ left: -Infinity, right: Infinity, top: offset - 12, bottom: offset }]
    expect(sortedScoreInkSeparation(header, row)).toBe(exhaustive(header, row))
    expect(sortedScoreInkSeparation(row, header)).toBe(exhaustive(row, header))
  }
  for (const top of [-Infinity, Infinity, NaN]) {
    const unusual = [{ left: 0, right: 2, top, bottom: 5 }, { left: 1, right: 3, top: -1, bottom: 7 }]
    cacheScoreInkSeparation(unusual)
    const header = [{ left: -Infinity, right: Infinity, top: 0, bottom: 12 }]
    expect(sortedScoreInkSeparation(header, unusual)).toBe(exhaustive(header, unusual))
  }
})
