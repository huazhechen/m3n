import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chooseBestWidth, widthCandidates, probeWidthCandidates } from './scorebook-width.mjs'
import { packScorebook, optimizeScorebook, reorderForSharing, sharedPreferredWidth, sharedScoreGap } from './scorebook-packing.mjs'

test('the search includes both ends of the 540–720 range in 10px steps', () => {
  assert.deepEqual(widthCandidates, Array.from({ length: 19 }, (_, index) => 540 + index * 10))
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

test('sharing always renders at 640px and recommends 540px for solo reading', () => {
  assert.equal(sharedPreferredWidth, 540)
  const entries = [entry('A', [candidate(540, 420), candidate(640, 420)]), entry('B', [candidate(540, 420), candidate(640, 420)])]
  assert.deepEqual(packScorebook(entries), [{ start: 0, end: 2, width: 640, pageCount: 1 }])
  entries[1].candidates[1].overlaps.push('lyric')
  assert.equal(packScorebook(entries).length, 2)
})

test('packing optimizes the complete sequence instead of greedily choosing the narrowest first page', () => {
  const entries = [200, 200, 700, 200].map((height, index) => entry(String(index), [candidate(640, height), candidate(720, height), candidate(800, height)]))
  const packed = packScorebook(entries)
  assert.equal(packed.length, 2)
  assert.deepEqual(packed.map(group => [group.start, group.end, group.width]), [[0, 2, 640], [2, 4, 640]])
})

test('section boundaries, explicit breaks, opt-outs and long works stay on separate pages', () => {
  const short = [candidate(640, 100), candidate(720, 100)]
  for (const extra of [{ section: 'next' }, { breakBefore: true }, { sharePage: false }]) {
    assert.equal(packScorebook([entry('A', short), entry('B', short, extra)]).length, 2)
  }
  assert.deepEqual(packScorebook([entry('A', [candidate(640, undefined, 2)]), entry('B', short)]), [
    { start: 0, end: 1, width: 640, pageCount: 2 }, { start: 1, end: 2, width: 640, pageCount: 1 },
  ])
  assert.deepEqual(packScorebook([]), [])
})

test('width stability caches 655 between 650 and 660 and excludes a page-count transition', async () => {
  const measured = []
  const { candidates, renderCache } = await probeWidthCandidates(async width => {
    measured.push(width)
    return candidate(width, 100, width < 650 ? 2 : 1)
  })
  assert.deepEqual(renderCache, { requests: 57, uniqueWidths: 39, hits: 18 })
  assert.equal(measured.filter(width => width === 655).length, 1)
  assert.equal(candidates.find(c => c.width === 650).stable, false)
  assert.equal(chooseBestWidth(candidates).width, 660)
})

test('shared pages must fit at 635 and 645 during stability verification', () => {
  const entries = ['A', 'B'].map(title => entry(title, [candidate(540, 440), { ...candidate(640, 440), stable: true,
    stabilityCases: [candidate(635, 530), candidate(640, 440), candidate(645, 440)] }]))
  assert.equal(packScorebook(entries).length, 2)
})

test('chapter works can share across distant positions while preserving chapter boundaries and anchors', () => {
  const entries = [200, 900, 900, 900, 900, 900, 200].map((height, index) => entry(String(index), [candidate(540, height), candidate(640, height)]))
  assert.equal(packScorebook(entries).length, 7)
  const ordered = reorderForSharing(entries)
  assert.equal(packScorebook(ordered).length, 6)
  assert.equal(new Set(ordered).size, entries.length)
  assert(ordered.some((work, index) => Math.abs(entries.indexOf(work) - index) > 3))
  assert.deepEqual(reorderForSharing(entries, new Set(['classic', 'golden', 'pop', 'instrumental'])), entries)
  for (const extra of [{ section: 'next' }, { breakBefore: true }, { sharePage: false }]) {
    const blocked = entries.map(work => ({ ...work }))
    Object.assign(blocked[1], extra)
    assert.deepEqual(reorderForSharing(blocked), blocked)
  }
})

test('fixed-order pagination balances the whole chapter instead of leaving a short solo between packed pages', () => {
  const entries = Array.from({ length: 9 }, (_, index) => entry(String(index), [candidate(540, 200), candidate(640, 200)]))
  const result = optimizeScorebook(entries)
  assert.deepEqual(result.entries, entries)
  assert.deepEqual(result.groups.map(group => group.end - group.start), [3, 3, 3])
  assert(result.metrics.pageGroups.every(group => group.naturalFill >= .65 && group.naturalFill < .85))
})

test('inter-work whitespace is a hard capacity constraint at central and perturbation widths', () => {
  assert.equal(sharedScoreGap, 32)
  const entries = ['A', 'B'].map(title => entry(title, [candidate(540, 455), candidate(640, 455)]))
  // 455 + 455 + the old 22px gap would fit the 939px content box.
  assert.equal(packScorebook(entries).length, 2)
  for (const work of entries) work.candidates[1] = { ...candidate(640, 450), stable: true,
    stabilityCases: [candidate(635, 451), candidate(640, 450), candidate(645, 450)] }
  assert.equal(packScorebook(entries).length, 2) // 934px exceeds the 635px probe's 932px capacity.
})

test('exact chapter set partitioning matches exhaustive permutation search', () => {
  const entries = [480, 420, 330, 280, 220, 170].map((height, index) => entry(String(index), [candidate(540, height), candidate(640, height)]))
  const result = optimizeScorebook(entries, new Set(['basics']))
  let minimum = Infinity
  function permute(prefix, remaining) {
    if (!remaining.length) { minimum = Math.min(minimum, optimizeScorebook(prefix).metrics.cost); return }
    for (let index = 0; index < remaining.length; index++) permute([...prefix, remaining[index]], remaining.filter((_, other) => other !== index))
  }
  permute([], entries)
  assert(Math.abs(result.metrics.cost - minimum) < 1e-9)
  assert.equal(new Set(result.entries).size, entries.length)
  const locked = optimizeScorebook(entries, new Set(['classic']))
  assert.deepEqual(locked.entries, entries)
})

test('large chapters retain exact packing across the 32-bit boundary without a chapter-size cap', () => {
  const entries = Array.from({ length: 40 }, (_, index) => entry(String(index), [candidate(540, 900), candidate(640, 900)]))
  for (const index of [0, 39]) entries[index].candidates = [candidate(540, 200), candidate(640, 200)]
  const result = optimizeScorebook(entries, new Set(['basics']))
  assert.equal(result.metrics.pages, 39)
  assert.deepEqual(result.metrics.pageGroups.find(group => group.titles.length === 2).titles, ['0', '39'])
  assert.equal(result.entries.length, 40)
  assert.equal(new Set(result.entries).size, 40)
})

test('forced solo works in a large chapter do not change the optimal partition of short works', () => {
  const shorts = [480, 420, 330, 280, 220, 170].map((height, index) => entry(`short-${index}`, [candidate(540, height), candidate(640, height)]))
  const solos = Array.from({ length: 35 }, (_, index) => entry(`solo-${index}`, [candidate(540, undefined, 2), candidate(640, undefined, 2)]))
  const expected = optimizeScorebook(shorts, new Set(['basics']))
  const result = optimizeScorebook([...solos, ...shorts], new Set(['basics']))
  assert(Math.abs(result.metrics.cost - expected.metrics.cost - 70) < 1e-9)
  assert.equal(result.metrics.pages, expected.metrics.pages + 70)
  assert.deepEqual(result.entries.slice(35), expected.entries)
})
