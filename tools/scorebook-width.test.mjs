import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chooseBestWidth, widthCandidates, probeWidthCandidates, selectBestWidth } from './scorebook-width.mjs'
import { packScorebook, optimizeScorebook, reorderForSharing, sharedPreferredWidth, sharedScoreGap, sharedWidthMaximum, sharedWidthCandidates } from './scorebook-packing.mjs'

test('the shared online and offline search uses nine 24px levels from 576–768px', () => {
  assert.deepEqual(widthCandidates, Array.from({ length: 9 }, (_, index) => 576 + index * 24))
})

test('a failed search preserves the engraving error for the reader', async () => {
  await assert.rejects(selectBestWidth(async () => { throw new Error('单个五线谱谱行超过页面高度。') }),
    /没有可用的排版候选。 单个五线谱谱行超过页面高度。/)
})
test('prefer fewer A4 pages, then the shared quality score, excluding unsafe renders', () => {
  const candidate = (width, pageCount, extra = {}) => ({ width, pageCount, outside: [], overlaps: [], ...extra })
  const chosen = candidate(700, 1, { qualityScore: .9 })
  assert.equal(chooseBestWidth([
    candidate(720, 2), candidate(710, 1, { qualityScore: .8, overlaps: ['lyric'] }), candidate(690, 1, { outside: ['note'] }),
    { width: 650, error: 'render failed' }, candidate(800, 1), candidate(700, 1, { qualityScore: .7 }), chosen,
  ]), chosen)
  assert.equal(chooseBestWidth([{ width: 720, error: 'render failed' }]), null)
})

test('larger type outweighs a small density improvement without adding pages', async () => {
  // Real-font metrics from 你是我心爱的姑娘: seven rows at 738px used to
  // beat eight rows at 702px despite its smaller displayed type.
  const measure = async width => ({ width, rows: width >= 738 ? 7 : 8,
    pageCount: width < 702 ? 2 : 1, outside: [], overlaps: [], lastLineSlack: 0,
    lineDensityVariation: width >= 738 ? .051956 : .118302 })
  const { best } = await selectBestWidth(measure)
  assert.equal(best.width, 702)
  assert.equal(best.pageCount, 1)
  assert.equal(chooseBestWidth([await measure(576), await measure(738)]).width, 738)
  // Font size has more weight, but a severely uneven layout can still lose.
  assert.equal(chooseBestWidth([{ ...await measure(702), lineDensityVariation: 1 }, await measure(738)]).width, 738)
})

const candidate = (width, naturalHeight, pageCount = 1, extra = {}) => ({ width, naturalHeight, pageCount, rows: 2, outside: [], overlaps: [],
  ...extra })
const entry = (title, candidates, extra = {}) => ({ title, section: 'basics', candidates: candidates.some(item => item.width === 576)
  ? candidates : [...candidates, candidate(576, candidates.at(-1)?.naturalHeight, candidates.at(-1)?.pageCount ?? 1)], ...extra })

test('576px determines sharing eligibility and the shared page width', () => {
  assert.equal(sharedPreferredWidth, 576)
  const make = height => widthCandidates.map(width => candidate(width, height))
  const entries = [entry('A', make(320)), entry('B', make(320))]
  assert.deepEqual(packScorebook(entries), [{ start: 0, end: 2, width: 576, pageCount: 1 }])
  entries[1].candidates.find(item => item.width === 576).overlaps.push('lyric')
  assert.equal(packScorebook(entries).length, 2)
})

test('shared widths stop at 576px while solo selection can still choose 768px', () => {
  assert.equal(sharedWidthMaximum, 576)
  assert.deepEqual(sharedWidthCandidates, [576])
  const entries = ['A', 'B'].map(title => entry(title, widthCandidates.map(width => candidate(width, 250, 1,
    { qualityScore: width === 768 ? 10 : width === 720 ? 9 : width === 696 ? 8 : width === 576 ? 2 : 1 }))))
  assert.equal(chooseBestWidth(entries[0].candidates).width, 768)
  assert.equal(packScorebook(entries)[0].width, 576)
  assert.equal(optimizeScorebook(entries, new Set(['basics'])).groups[0].width, 576)
})

test('passing wider widths cannot bypass 576px admission', () => {
  for (const atAdmission of [candidate(576, 250, 2), candidate(576, 520)]) {
    const entries = ['A', 'B'].map(title => entry(title, [atAdmission, candidate(600, 250), candidate(768, 250)]))
    assert.equal(packScorebook(entries).length, 2)
    assert.equal(optimizeScorebook(entries, new Set(['basics'])).groups.length, 2)
  }
})

test('a shared page stays at 576px even when wider candidates score higher', () => {
  const entries = ['A', 'B'].map(title => entry(title, widthCandidates.map(width => candidate(width, 250, 1,
    { qualityScore: width === 648 ? 2 : .5 })) ))
  assert.equal(packScorebook(entries)[0].width, 576)
  entries[1].candidates.find(item => item.width === 576).outside.push('ink')
  assert.equal(packScorebook(entries).length, 2)
})

test('packing optimizes the complete sequence instead of greedily choosing the narrowest first page', () => {
  const entries = [200, 200, 560, 200].map((height, index) => entry(String(index), [candidate(600, height), candidate(696, height), candidate(576, height)]))
  const packed = packScorebook(entries)
  assert.equal(packed.length, 2)
  assert.deepEqual(packed.map(group => [group.start, group.end, group.width]), [[0, 2, 576], [2, 4, 576]])
})

test('section boundaries, explicit breaks, opt-outs and long works stay on separate pages', () => {
  const short = [candidate(600, 100), candidate(696, 100)]
  for (const extra of [{ section: 'next' }, { breakBefore: true }, { sharePage: false }]) {
    assert.equal(packScorebook([entry('A', short), entry('B', short, extra)]).length, 2)
  }
  assert.deepEqual(packScorebook([entry('A', [candidate(600, undefined, 2)]), entry('B', short)]), [
    { start: 0, end: 1, width: 576, pageCount: 2 }, { start: 1, end: 2, width: 576, pageCount: 1 },
  ])
  assert.deepEqual(packScorebook([]), [])
})

test('search selects a level across a page-count transition', async () => {
  const measured = []
  const { candidates, renderCache } = await probeWidthCandidates(async width => {
    measured.push(width)
    return candidate(width, 100, width < 624 ? 2 : 1)
  })
  assert.deepEqual(measured, [...widthCandidates, 606, 612, 618, 630, 636, 642])
  assert.equal(renderCache.uniqueWidths, 15)
  assert.equal(chooseBestWidth(candidates).width, 624)
})

test('scoring checks every formal width and chooses the best composite score', async () => {
  const result = await probeWidthCandidates(async width => candidate(width, 100, 1,
    { qualityScore: width === 648 ? 2 : .5 }))
  assert.deepEqual(result.candidates.map(item => item.width), [...widthCandidates, 630, 636, 642, 654, 660, 666])
  assert.equal(chooseBestWidth(result.candidates).width, 648)
  assert.equal(result.renderCache.uniqueWidths, 15)
})

test('nonmonotone pagination is evaluated across the complete grid', async () => {
  const result = await probeWidthCandidates(async width => candidate(width, 100, width === 624 ? 1 : 2))
  assert.equal(chooseBestWidth(result.candidates).width, 624)
})

test('SVG checks verify coarse and refined candidates', async () => {
  const verified = []
  const result = await probeWidthCandidates(async width => candidate(width, 100), {
    verify: async width => {
      verified.push(width)
      return { outside: width < 600 ? ['ink'] : [], overlaps: [] }
    },
  })
  assert.equal(chooseBestWidth(result.candidates).width, 600)
  assert.deepEqual(verified, [...widthCandidates, 582, 588, 594, 606, 612, 618])
})

test('failed renders are recorded and excluded', async () => {
  const result = await probeWidthCandidates(async width => {
    if (width < 600) throw new Error('render failed')
    return candidate(width, 100)
  })
  assert.equal(chooseBestWidth(result.candidates).width, 600)
  assert.equal(result.candidates.filter(c => c.error).length, 4)
  const failed = await probeWidthCandidates(async () => { throw new Error('unrenderable') })
  assert.equal(chooseBestWidth(failed.candidates), null)
})

test('chapter works can share across distant positions while preserving chapter boundaries and anchors', () => {
  const entries = [200, 900, 900, 900, 900, 900, 200].map((height, index) => entry(String(index), [candidate(576, height), candidate(600, height)]))
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
  const entries = Array.from({ length: 9 }, (_, index) => entry(String(index), [candidate(576, 200), candidate(600, 200)]))
  const result = optimizeScorebook(entries)
  assert.deepEqual(result.entries, entries)
  assert.deepEqual(result.groups.map(group => group.end - group.start), [3, 3, 3])
  assert(result.metrics.pageGroups.every(group => group.naturalFill >= .65 && group.naturalFill < .85))
})

test('inter-work whitespace is a hard capacity constraint at actual candidate widths', () => {
  assert.equal(sharedScoreGap, 36)
  const entries = ['A', 'B'].map(title => entry(title, [candidate(576, 455), candidate(600, 455), candidate(768, 515)]))
  // The 576px admission check rejects the combined height, even if 768px fits.
  assert.equal(packScorebook(entries).length, 2)
  for (const work of entries) work.candidates[1] = candidate(600, 450)
  assert.equal(packScorebook(entries).length, 2) // 936px exceeds the 600px capacity.
})

test('exact chapter set partitioning matches exhaustive permutation search', () => {
  const entries = [480, 420, 330, 280, 220, 170].map((height, index) => entry(String(index), [candidate(576, height), candidate(600, height)]))
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
  const entries = Array.from({ length: 40 }, (_, index) => entry(String(index), [candidate(576, 900), candidate(600, 900)]))
  for (const index of [0, 39]) entries[index].candidates = [candidate(576, 200), candidate(600, 200), candidate(672, 200), candidate(768, 200)]
  const result = optimizeScorebook(entries, new Set(['basics']))
  assert.equal(result.metrics.pages, 39)
  assert.deepEqual(result.metrics.pageGroups.find(group => group.titles.length === 2).titles, ['0', '39'])
  assert.equal(result.entries.length, 40)
  assert.equal(new Set(result.entries).size, 40)
})

test('forced solo works in a large chapter do not change the optimal partition of short works', () => {
  const shorts = [480, 420, 330, 280, 220, 170].map((height, index) => entry(`short-${index}`, [candidate(576, height), candidate(600, height)]))
  const solos = Array.from({ length: 35 }, (_, index) => entry(`solo-${index}`, [candidate(576, undefined, 2), candidate(600, undefined, 2)]))
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
  assert.deepEqual(widths, [576])
  await assert.rejects(selectBestWidth(async width => candidate(width, 100, 1, { overlaps: ['lyric'] })), /排版候选/)
})

test('search visits coarse levels once before refining between both neighbors', async () => {
  const measured = []
  const result = await selectBestWidth(async width => {
    measured.push(width)
    return candidate(width, 100, 1, { qualityScore: width === 648 ? 2 : 1 })
  })
  assert.deepEqual(measured, [...widthCandidates, 630, 636, 642, 654, 660, 666])
  assert.equal(result.best.width, 648)
  assert.equal(result.renderCache.requests, 15)
})

test('cancellation between levels stops further measurements', async () => {
  const controller = new AbortController(), measured = []
  await assert.rejects(selectBestWidth(async width => {
    measured.push(width)
    if (width === 624) controller.abort()
    return candidate(width, 100)
  }, { signal: controller.signal }), { name: 'AbortError' })
  assert.deepEqual(measured, [576, 600, 624])
})

test('shared packing ignores off-level and above-threshold candidates', () => {
  const entries = ['A', 'B'].map(title => entry(title, widthCandidates.map(width => candidate(width, 250))))
  for (const work of entries) work.candidates.push(candidate(588, 250, 1, { qualityScore: 100 }))
  assert.equal(packScorebook(entries)[0].width, 576)
  assert(sharedWidthCandidates.every(width => widthCandidates.includes(width) && width <= 576))
})

for (const coarseBest of [576, 648, 768]) {
  test(`6px refinement around ${coarseBest}px stays in bounds and finds a better width`, async () => {
    const fineBest = coarseBest === 768 ? 762 : coarseBest + 6
    const measured = []
    const result = await selectBestWidth(async width => {
      measured.push(width)
      return candidate(width, 100, 1, { qualityScore: width === fineBest ? 3 : width === coarseBest ? 2 : 1 })
    })
    assert.deepEqual(measured.slice(0, 9), widthCandidates)
    assert.equal(new Set(measured).size, measured.length)
    assert(measured.every(width => width >= 576 && width <= 768))
    assert.equal(result.best.width, fineBest)
    assert.equal(measured.length, coarseBest === 648 ? 15 : 12)
  })
}

test('refinement preserves page-count priority and excludes unsafe fine candidates', async () => {
  const result = await selectBestWidth(async width => candidate(width, 100, width === 654 ? 2 : 1,
    { qualityScore: width === 654 || width === 660 ? 100 : width === 648 ? 2 : 1,
      overlaps: width === 660 ? ['lyric'] : [] }))
  assert.equal(result.best.width, 648)
})

test('cancellation during refinement stops immediately', async () => {
  const controller = new AbortController(), measured = []
  await assert.rejects(selectBestWidth(async width => {
    measured.push(width)
    if (width === 582) controller.abort()
    return candidate(width, 100)
  }, { signal: controller.signal }), { name: 'AbortError' })
  assert.deepEqual(measured, [...widthCandidates, 582])
})
