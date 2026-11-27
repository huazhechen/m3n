import { expect, it } from 'vitest'
import { balanceScorePageTail } from './layout/page-tail.js'
import { paginateScoreBlocks } from './layout/pagination.js'

it('moves the fewest systems to avoid an orphan without adding pages', () => {
  const groups = [{ first: 0, end: 5 }, { first: 5, end: 6 }]
  expect(balanceScorePageTail(groups, (first, end) => end - first <= 5, (first, end) => end - first))
    .toEqual([{ first: 0, end: 4 }, { first: 4, end: 6 }])
  expect(groups[0]!.end).toBe(5)
  expect(balanceScorePageTail(groups, (_, end) => end < 6, (first, end) => end - first)).toEqual(groups)
})
it('does not create a new orphan on the preceding page or detach a header', () => {
  const count = (first: number, end: number) => end - first
  expect(balanceScorePageTail([{ first: 0, end: 2 }, { first: 2, end: 3 }], () => true, count))
    .toEqual([{ first: 0, end: 2 }, { first: 2, end: 3 }])
  expect(balanceScorePageTail([{ first: 0, end: 5 }, { first: 5, end: 6 }], () => true, count, index => index !== 4))
    .toEqual([{ first: 0, end: 3 }, { first: 3, end: 6 }])
})
it('rechecks real elastic ink constraints when moving a final system', () => {
  const blocks = Array.from({ length: 6 }, () => ({ height: 10, core: { top: 0, bottom: 10 }, ink: [{ left: 0, right: 10, top: 0, bottom: 10 }] }))
  const result = paginateScoreBlocks(blocks, { pageHeight: 50, margin: 0, gap: 0, elastic: true })
  expect(result.positions.map(position => position.page)).toEqual([0, 0, 0, 0, 1, 1])
  expect(result.positions.every(position => position.top + 10 <= 50)).toBe(true)
})
