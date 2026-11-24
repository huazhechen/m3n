import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inkOverlapPairs } from './lib/ink-overlap-pairs.mjs'

const exhaustive = boxes => {
  const result = []
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]
    if (Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > .5 &&
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > .5) result.push([i, j])
  }
  return result
}

test('spatial screening preserves exhaustive pairs, tolerance boundaries and diagnostic order', () => {
  const boxes = [
    { x: 10, y: 0, width: 10, height: 10 },
    { x: 0, y: 0, width: 10.5, height: 10 },
    { x: 0, y: 0, width: 10.500001, height: 10 },
    { x: 0, y: 9.5, width: 20, height: 10 },
    { x: 10, y: 0, width: 0, height: 10 },
    { x: 10, y: 0, width: .5, height: 10 },
  ]
  assert.deepEqual(inkOverlapPairs(boxes), exhaustive(boxes))
  let seed = 123456
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  for (let trial = 0; trial < 50; trial++) {
    const sample = Array.from({ length: 100 }, () => ({ x: random() * 300 - 100, y: random() * 300 - 100, width: random() * 40, height: random() * 40 }))
    assert.deepEqual(inkOverlapPairs(sample), exhaustive(sample))
  }
})

test('widely separated glyphs avoid pair comparisons', () => {
  const stats = {}
  const boxes = Array.from({ length: 1000 }, (_, index) => ({ x: index * 10, y: 0, width: 8, height: 12 }))
  assert.deepEqual(inkOverlapPairs(boxes, .5, stats), [])
  assert.equal(stats.testedPairs, 0)
})
