import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chooseBestWidth, widthCandidates, probeWidthCandidates, selectBestWidth } from './scorebook-width.mjs'
import { packScorebook, optimizeScorebook, reorderForSharing, sharedPreferredWidth, sharedScoreGap, sharedWidthMaximum, sharedWidthCandidates } from './scorebook-packing.mjs'

test('the shared online and offline search uses 480–720px in 20px steps', () => {
  assert.deepEqual(widthCandidates, Array.from({ length: 13 }, (_, index) => 480 + index * 20))
})
test('prefer fewer A4 pages, then the shared quality score, excluding unsafe renders', () => {
  const candidate = (width, pageCount, extra = {}) => ({ width, pageCount, outside: [], overlaps: [], ...extra })
  const chosen = candidate(700, 1, { qualityScore: .9 })
  assert.equal(chooseBestWidth([
    candidate(640, 2), candidate(710, 1, { qualityScore: .8, overlaps: ['lyric'] }), candidate(690, 1, { outside: ['note'] }),
    { width: 650, error: 'render failed' }, candidate(800, 1), candidate(700, 1, { qualityScore: .7 }), chosen,
  ]), chosen)
  assert.equal(chooseBestWidth([{ width: 640, error: 'render failed' }]), null)
})

const candidate = (width, naturalHeight, pageCount = 1, extra = {}) => ({ width, naturalHeight, pageCount, rows: 2, outside: [], overlaps: [],
  ...extra })
const entry = (title, candidates, extra = {}) => ({ title, section: 'basics', candidates: candidates.some(item => item.width === 640)
  ? candidates : [...candidates, candidate(640, candidates.at(-1)?.naturalHeight, candidates.at(-1)?.pageCount ?? 1)], ...extra })

test('640px determines sharing eligibility, then the highest-quality fitting common width is selected', () => {
  assert.equal(sharedPreferredWidth, 480)
  const make = height => widthCandidates.map(width => candidate(width, height))
  const entries = [entry('A', make(320)), entry('B', make(320))]
  assert.deepEqual(packScorebook(entries), [{ start: 0, end: 2, width: 480, pageCount: 1 }])
  entries[1].candidates.find(item => item.width === 640).overlaps.push('lyric')
  assert.equal(packScorebook(entries).length, 2)
})

test('shared widths stop at 640px while solo selection can still choose 720px', () => {
  assert.equal(sharedWidthMaximum, 640)
  assert.deepEqual(sharedWidthCandidates, [480, 500, 520, 540, 560, 580, 600, 620, 640])
  const entries = ['A', 'B'].map(title => entry(title, widthCandidates.map(width => candidate(width, 250, 1,
    { qualityScore: width === 720 ? 10 : width === 620 ? 2 : 1 }))))
  assert.equal(chooseBestWidth(entries[0].candidates).width, 720)
  assert.equal(packScorebook(entries)[0].width, 620)
  assert.equal(optimizeScorebook(entries, new Set(['basics'])).groups[0].width, 620)
})

test('passing 720px or narrower widths cannot bypass 640px admission', () => {
  for (const at640 of [candidate(640, 250, 2), candidate(640, 470)]) {
    const entries = ['A', 'B'].map(title => entry(title, [candidate(540, 250), at640, candidate(720, 250)]))
    assert.equal(packScorebook(entries).length, 2)
    assert.equal(optimizeScorebook(entries, new Set(['basics'])).groups.length, 2)
  }
})

test('a shared page prefers balanced quality over the narrowest feasible width', () => {
  const entries = ['A', 'B'].map(title => entry(title, widthCandidates.map(width => candidate(width, 250, 1,
    { qualityScore: width === 600 ? 2 : .5 })) ))
  assert.equal(packScorebook(entries)[0].width, 600)
  entries[1].candidates.find(item => item.width === 600).outside.push('ink')
  assert.notEqual(packScorebook(entries)[0].width, 600)
})

test('packing optimizes the complete sequence instead of greedily choosing the narrowest first page', () => {
  const entries = [200, 200, 700, 200].map((height, index) => entry(String(index), [candidate(560, height), candidate(620, height), candidate(640, height)]))
  const packed = packScorebook(entries)
  assert.equal(packed.length, 2)
  assert.deepEqual(packed.map(group => [group.start, group.end, group.width]), [[0, 2, 560], [2, 4, 640]])
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

test('search refines the coarse winner across a page-count transition', async () => {
  const measured = []
  const { candidates, renderCache } = await probeWidthCandidates(async width => {
    measured.push(width)
    return candidate(width, 100, width < 570 ? 2 : 1)
  })
  assert.deepEqual(measured, [...widthCandidates, 570, 590])
  assert.equal(renderCache.uniqueWidths, 15)
  assert.equal(chooseBestWidth(candidates).width, 570)
})

test('scoring checks every formal width and chooses the best composite score', async () => {
  const result = await probeWidthCandidates(async width => candidate(width, 100, 1,
    { qualityScore: width === 600 ? 2 : .5 }))
  assert.deepEqual(result.candidates.map(item => item.width), [...widthCandidates, 590, 610])
  assert.equal(chooseBestWidth(result.candidates).width, 600)
  assert.equal(result.renderCache.uniqueWidths, 15)
})

test('nonmonotone pagination is evaluated across the complete grid', async () => {
  const result = await probeWidthCandidates(async width => candidate(width, 100, width === 580 ? 1 : 2))
  assert.equal(chooseBestWidth(result.candidates).width, 580)
})

test('SVG checks also verify the fine candidates', async () => {
  const verified = []
  const result = await probeWidthCandidates(async width => candidate(width, 100), {
    verify: async width => {
      verified.push(width)
      return { outside: width < 560 ? ['ink'] : [], overlaps: [] }
    },
  })
  assert.equal(chooseBestWidth(result.candidates).width, 560)
  assert.deepEqual(verified, [...widthCandidates, 550, 570])
})

test('failed renders are recorded and excluded', async () => {
  const result = await probeWidthCandidates(async width => {
    if (width < 560) throw new Error('render failed')
    return candidate(width, 100)
  })
  assert.equal(chooseBestWidth(result.candidates).width, 560)
  assert.equal(result.candidates.filter(c => c.error).length, 5)
  const failed = await probeWidthCandidates(async () => { throw new Error('unrenderable') })
  assert.equal(chooseBestWidth(failed.candidates), null)
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

test('inter-work whitespace is a hard capacity constraint at actual candidate widths', () => {
  assert.equal(sharedScoreGap, 32)
  const entries = ['A', 'B'].map(title => entry(title, [candidate(540, 455), candidate(560, 455), candidate(720, 515)]))
  // The 640px admission check rejects the combined height, even if 720px fits.
  assert.equal(packScorebook(entries).length, 2)
  for (const work of entries) work.candidates[1] = candidate(560, 450)
  assert.equal(packScorebook(entries).length, 2) // 932px exceeds the 560px capacity.
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
  for (const index of [0, 39]) entries[index].candidates = [candidate(540, 200), candidate(560, 200), candidate(640, 200), candidate(720, 200)]
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

test('common selection propagates cancellation and rejects every unsafe candidate', async () => {
  const controller = new AbortController(), widths = []
  await assert.rejects(selectBestWidth(async width => {
    widths.push(width); controller.abort(); return candidate(width, 100)
  }, { signal: controller.signal }), { name: 'AbortError' })
  assert.deepEqual(widths, [480])
  await assert.rejects(selectBestWidth(async width => candidate(width, 100, 1, { overlaps: ['lyric'] })), /排版候选/)
})

for (const [coarse, fine] of [[480, [490]], [720, [710]], [600, [590, 610]]]) {
  test(`fine search stays in bounds and measures only neighbors of ${coarse}px`, async () => {
    const measured = []
    const result = await selectBestWidth(async width => {
      measured.push(width)
      return candidate(width, 100, 1, { qualityScore: width === coarse ? 2 : fine.includes(width) ? 3 : 1 })
    })
    assert.deepEqual(measured, [...widthCandidates, ...fine])
    assert.equal(result.best.width, Math.min(...fine))
    assert.equal(new Set(measured).size, measured.length)
    assert.equal(result.renderCache.requests, measured.length)
  })
}

test('fine renders keep safety and page count ahead of quality', async () => {
  const result = await selectBestWidth(async width => candidate(width, 100, width === 610 ? 2 : 1,
    { qualityScore: width === 600 ? 2 : 10, outside: width === 590 ? ['ink'] : [] }), {
    // Only 600px is safe in the coarse grid.
    verify: async width => ({ overlaps: width % 20 === 0 && width !== 600 ? ['lyric'] : [] }),
  })
  assert.equal(result.best.width, 600)
})

test('all failed coarse renders skip refinement', async () => {
  const measured = []
  const result = await probeWidthCandidates(async width => { measured.push(width); throw new Error('failed') })
  assert.deepEqual(measured, widthCandidates)
  assert.equal(result.renderCache.requests, widthCandidates.length)
})

test('cancellation during refinement stops the search', async () => {
  const controller = new AbortController(), measured = []
  await assert.rejects(selectBestWidth(async width => {
    measured.push(width)
    if (width === 590) controller.abort()
    return candidate(width, 100, 1, { qualityScore: width === 600 ? 2 : 1 })
  }, { signal: controller.signal }), { name: 'AbortError' })
  assert.deepEqual(measured, [...widthCandidates, 590])
})
