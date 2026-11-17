import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chooseBestWidth, widthCandidates } from './scorebook-width.mjs'
import { packScorebook } from './scorebook-packing.mjs'

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

const candidate = (width, naturalHeight, pageCount = 1, extra = {}) => ({ width, naturalHeight, pageCount, rows: 2, outside: [], overlaps: [], ...extra })
const entry = (title, candidates, extra = {}) => ({ title, section: 'basics', candidates, ...extra })

test('sharing chooses one common safe width and never uses per-score scales', () => {
  const entries = [entry('A', [candidate(640, 480), candidate(700, 480)]), entry('B', [candidate(640, 480), candidate(700, 480)])]
  assert.deepEqual(packScorebook(entries), [{ start: 0, end: 2, width: 700, pageCount: 1 }])
  entries[1].candidates[1].overlaps.push('lyric')
  assert.equal(packScorebook(entries).length, 2)
})

test('packing optimizes the complete sequence instead of greedily choosing the narrowest first page', () => {
  const entries = [200, 200, 700, 200].map((height, index) => entry(String(index), [candidate(640, height), candidate(800, height)]))
  const packed = packScorebook(entries)
  assert.equal(packed.length, 2)
  assert.deepEqual(packed.map(group => [group.start, group.end, group.width]), [[0, 2, 640], [2, 4, 640]])
})

test('section boundaries, explicit breaks, opt-outs and long works stay on separate pages', () => {
  const short = [candidate(640, 100)]
  for (const extra of [{ section: 'next' }, { breakBefore: true }, { sharePage: false }]) {
    assert.equal(packScorebook([entry('A', short), entry('B', short, extra)]).length, 2)
  }
  assert.deepEqual(packScorebook([entry('A', [candidate(640, undefined, 2)]), entry('B', short)]), [
    { start: 0, end: 1, width: 640, pageCount: 2 }, { start: 1, end: 2, width: 640, pageCount: 1 },
  ])
  assert.deepEqual(packScorebook([]), [])
})
