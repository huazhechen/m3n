import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chooseBestWidth, widthCandidates } from './scorebook-width.mjs'

test('the search includes both ends of the 640–800 range in 10px steps', () => {
  assert.deepEqual(widthCandidates, Array.from({ length: 17 }, (_, index) => 640 + index * 10))
})
test('prefer fewer A4 pages, then larger music, excluding unsafe or failed renders', () => {
  const candidate = (width, pageCount, extra = {}) => ({ width, pageCount, outside: [], overlaps: [], ...extra })
  const chosen = candidate(710, 1)
  assert.equal(chooseBestWidth([
    candidate(640, 2), candidate(700, 1, { overlaps: ['lyric'] }), candidate(690, 1, { outside: ['note'] }),
    { width: 650, error: 'render failed' }, candidate(800, 1), chosen,
  ]), chosen)
  assert.equal(chooseBestWidth([{ width: 640, error: 'render failed' }]), null)
})
