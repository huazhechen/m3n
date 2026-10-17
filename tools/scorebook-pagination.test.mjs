import assert from 'node:assert/strict'
import { test } from 'node:test'
import { paginateScorebookLayout, packScorebookGroup } from './scorebook-pagination.mjs'

const page = { bodyHeight: 200, scale: 1, minimumFillPercent: 90 }
const layout = cuts => ({ rows: cuts.length - 1, cuts })

test('the height floor is strict, including for a one-page score', () => {
  assert.equal(paginateScorebookLayout(layout([0, 180]), {}, page), null)
  assert.deepEqual(paginateScorebookLayout(layout([0, 181]), {}, page), [[0, 1]])
})

test('pagination balances complete systems and includes the continuation title', () => {
  const score = layout([0, 40, 80, 120, 185, 225, 265, 305, 335])
  assert.deepEqual(paginateScorebookLayout(score, { pageCount: 2 }, page), [[0, 4], [4, 8]])
  assert.equal(paginateScorebookLayout(score, { pageCount: 3 }, page), null)
})

test('a short complete score can wait for packing, but a short continuation cannot', () => {
  assert.deepEqual(paginateScorebookLayout(layout([0, 80]), { sharePage: true }, page), [[0, 1]])
  assert.equal(paginateScorebookLayout(layout([0, 185, 190, 195, 200, 205]), { sharePage: true }, page), null)
})

test('manual breaks must satisfy the same page floor, capacity and page count', () => {
  const score = layout([0, 185, 335])
  assert.deepEqual(paginateScorebookLayout(score, { pageBreaks: [1], pageCount: 2 }, page), [[0, 1], [1, 2]])
  assert.equal(paginateScorebookLayout(layout([0, 180, 330]), { pageBreaks: [1] }, page), null)
  assert.equal(paginateScorebookLayout(layout([0, 201, 351]), { pageBreaks: [1] }, page), null)
  assert.equal(paginateScorebookLayout(score, { pageBreaks: [1], pageCount: 3 }, page), null)
})

const entry = candidates => ({ sharedLayouts: new Map(candidates.map(([width, height]) => [width, { width, height }])) })
const packing = { bodyHeight: 200, shortGap: 22, minimumFillPercent: 90, renderScale: () => 1, maximumSharedWidth: 780 }

test('packing chooses the grouping and one common note size together', () => {
  const group = [entry([[520, 80], [640, 60]]), entry([[520, 80], [640, 60]])]
  const pages = packScorebookGroup(group, packing)
  assert.equal(pages.length, 1)
  assert.equal(pages[0].used, 182)
  assert.deepEqual(pages[0].layouts.map(item => item.width), [520, 520])
})

test('packing rejects exactly 90 percent and incompatible note sizes', () => {
  assert.equal(packScorebookGroup([entry([[520, 79]]), entry([[520, 79]])], packing), null)
  assert.equal(packScorebookGroup([entry([[520, 80]]), entry([[640, 80]])], packing), null)
})

test('already full scores stay on separate pages when sharing requires excessive reduction', () => {
  const group = [entry([[520, 185], [900, 80]]), entry([[520, 185], [900, 80]])]
  const pages = packScorebookGroup(group, packing)
  assert.equal(pages.length, 2)
  assert(pages.every(item => item.end - item.start === 1 && item.layouts[0].width === 520))
})
