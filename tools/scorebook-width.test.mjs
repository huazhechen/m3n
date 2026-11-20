import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chooseBestWidth, widthCandidates, probeWidthCandidates } from './scorebook-width.mjs'
import { packScorebook, optimizeScorebook, reorderForSharing, sharedPreferredWidth, sharedScoreGap } from './scorebook-packing.mjs'

test('the search includes both ends of the 480–640 range in 10px steps', () => {
  assert.deepEqual(widthCandidates, Array.from({ length: 17 }, (_, index) => 480 + index * 10))
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

test('sharing always renders at 560px and recommends 540px for solo reading', () => {
  assert.equal(sharedPreferredWidth, 540)
  const entries = [entry('A', [candidate(540, 380), candidate(560, 380)]), entry('B', [candidate(540, 380), candidate(560, 380)])]
  assert.deepEqual(packScorebook(entries), [{ start: 0, end: 2, width: 560, pageCount: 1 }])
  entries[1].candidates[1].overlaps.push('lyric')
  assert.equal(packScorebook(entries).length, 2)
})

test('packing optimizes the complete sequence instead of greedily choosing the narrowest first page', () => {
  const entries = [200, 200, 700, 200].map((height, index) => entry(String(index), [candidate(560, height), candidate(620, height), candidate(640, height)]))
  const packed = packScorebook(entries)
  assert.equal(packed.length, 3)
  assert.deepEqual(packed.map(group => [group.start, group.end, group.width]), [[0, 2, 560], [2, 3, 560], [3, 4, 560]])
})

test('section boundaries, explicit breaks, opt-outs and long works stay on separate pages', () => {
  const short = [candidate(560, 100), candidate(620, 100)]
  for (const extra of [{ section: 'next' }, { breakBefore: true }, { sharePage: false }]) {
    assert.equal(packScorebook([entry('A', short), entry('B', short, extra)]).length, 2)
  }
  assert.deepEqual(packScorebook([entry('A', [candidate(560, undefined, 2)]), entry('B', short)]), [
    { start: 0, end: 1, width: 560, pageCount: 2 }, { start: 1, end: 2, width: 560, pageCount: 1 },
  ])
  assert.deepEqual(packScorebook([]), [])
})

test('width stability caches 575 between 570 and 580 and excludes a page-count transition', async () => {
  const measured = []
  const { candidates, renderCache } = await probeWidthCandidates(async width => {
    measured.push(width)
    return candidate(width, 100, width < 575 ? 2 : 1)
  })
  assert.ok(renderCache.uniqueWidths < 25, JSON.stringify(renderCache))
  assert.equal(renderCache.requests - renderCache.hits, renderCache.uniqueWidths)
  assert.equal(measured.filter(width => width === 575).length, 1)
  assert.equal(candidates.find(c => c.width === 570), undefined)
  assert.equal(chooseBestWidth(candidates).width, 580)
})

test('flat pagination stops after coarse sampling and local stability verification', async () => {
  const measured = []
  const result = await probeWidthCandidates(async width => {
    measured.push(width)
    return candidate(width, 100)
  }, { requiredWidths: [640] })
  assert.equal(chooseBestWidth(result.candidates).width, 480)
  assert.ok(result.renderCache.uniqueWidths <= 9)
  assert.ok(result.candidates.find(c => c.width === 640)?.stable)
  assert.equal(new Set(measured).size, measured.length)
})

test('coarse interior samples detect nonmonotone pagination missed by endpoint bisection', async () => {
  const result = await probeWidthCandidates(async width => candidate(width, 100, width >= 535 && width <= 565 ? 1 : 2))
  assert.equal(chooseBestWidth(result.candidates).width, 540)
  assert.ok(result.renderCache.uniqueWidths < 25)
})

test('expensive SVG checks reject unsafe winners and search their neighbors', async () => {
  const verified = []
  const result = await probeWidthCandidates(async width => candidate(width, 100), {
    verify: async width => {
      verified.push(width)
      return { outside: width < 555 ? ['ink'] : [], overlaps: [] }
    },
  })
  assert.equal(chooseBestWidth(result.candidates).width, 560)
  assert.equal(new Set(verified).size, verified.length)
  assert.ok(result.renderCache.uniqueWidths < 25)
})

test('failed renders are recorded and never bypass stability verification', async () => {
  const result = await probeWidthCandidates(async width => {
    if (width < 555) throw new Error('render failed')
    return candidate(width, 100)
  })
  assert.equal(chooseBestWidth(result.candidates).width, 560)
  assert.ok(result.candidates.every(c => !c.stable || c.stabilityCases.every(p => !p.error)))
  const failed = await probeWidthCandidates(async () => { throw new Error('unrenderable') })
  assert.equal(chooseBestWidth(failed.candidates), null)
})

test('shared pages must fit at 555 and 565 during stability verification', () => {
  const entries = ['A', 'B'].map(title => entry(title, [candidate(540, 440), { ...candidate(560, 440), stable: true,
    stabilityCases: [candidate(555, 530), candidate(560, 440), candidate(565, 440)] }]))
  assert.equal(packScorebook(entries).length, 2)
})

test('chapter works can share across distant positions while preserving chapter boundaries and anchors', () => {
  const entries = [200, 900, 900, 900, 900, 900, 200].map((height, index) => entry(String(index), [candidate(540, height), candidate(560, height)]))
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
  const entries = Array.from({ length: 9 }, (_, index) => entry(String(index), [candidate(540, 200), candidate(560, 200)]))
  const result = optimizeScorebook(entries)
  assert.deepEqual(result.entries, entries)
  assert.deepEqual(result.groups.map(group => group.end - group.start), [3, 3, 3])
  assert(result.metrics.pageGroups.every(group => group.naturalFill >= .65 && group.naturalFill < .85))
})

test('inter-work whitespace is a hard capacity constraint at central and perturbation widths', () => {
  assert.equal(sharedScoreGap, 32)
  const entries = ['A', 'B'].map(title => entry(title, [candidate(540, 455), candidate(560, 455)]))
  // 455 + 455 + the old 22px gap would fit the 822px content box.
  assert.equal(packScorebook(entries).length, 2)
  for (const work of entries) work.candidates[1] = { ...candidate(560, 450), stable: true,
    stabilityCases: [candidate(555, 451), candidate(560, 450), candidate(565, 450)] }
  assert.equal(packScorebook(entries).length, 2) // 932px exceeds the 555px probe's 814px capacity.
})

test('exact chapter set partitioning matches exhaustive permutation search', () => {
  const entries = [480, 420, 330, 280, 220, 170].map((height, index) => entry(String(index), [candidate(540, height), candidate(560, height)]))
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
  const entries = Array.from({ length: 40 }, (_, index) => entry(String(index), [candidate(540, 900), candidate(560, 900)]))
  for (const index of [0, 39]) entries[index].candidates = [candidate(540, 200), candidate(560, 200)]
  const result = optimizeScorebook(entries, new Set(['basics']))
  assert.equal(result.metrics.pages, 39)
  assert.deepEqual(result.metrics.pageGroups.find(group => group.titles.length === 2).titles, ['0', '39'])
  assert.equal(result.entries.length, 40)
  assert.equal(new Set(result.entries).size, 40)
})

test('forced solo works in a large chapter do not change the optimal partition of short works', () => {
  const shorts = [480, 420, 330, 280, 220, 170].map((height, index) => entry(`short-${index}`, [candidate(540, height), candidate(560, height)]))
  const solos = Array.from({ length: 35 }, (_, index) => entry(`solo-${index}`, [candidate(540, undefined, 2), candidate(560, undefined, 2)]))
  const expected = optimizeScorebook(shorts, new Set(['basics']))
  const result = optimizeScorebook([...solos, ...shorts], new Set(['basics']))
  assert(Math.abs(result.metrics.cost - expected.metrics.cost - 70) < 1e-9)
  assert.equal(result.metrics.pages, expected.metrics.pages + 70)
  assert.deepEqual(result.entries.slice(35), expected.entries)
})
