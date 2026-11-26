import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chooseBestWidth, numberedLayoutScore, WidthSearchPruned, widthCandidates, probeWidthCandidates, selectBestWidth } from './scorebook-width.mjs'
import { packScorebook, optimizeScorebook, reorderForSharing, sharedPreferredWidth, sharedScoreGap, sharedWidthMaximum, sharedWidthCandidates, refineSharedWidths } from './scorebook-packing.mjs'

test('the shared online and offline search uses eleven 24px levels from 528–768px', () => {
  assert.deepEqual(widthCandidates, Array.from({ length: 11 }, (_, index) => 528 + index * 24))
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
const entry = (title, candidates, extra = {}) => ({ title, section: 'basics', candidates: candidates.some(item => item.width === 624)
  ? candidates : [...candidates, candidate(624, candidates.at(-1)?.naturalHeight, candidates.at(-1)?.pageCount ?? 1)], ...extra })

test('624px determines admission and sharing searches down to 528px', () => {
  assert.equal(sharedPreferredWidth, 528)
  const make = height => widthCandidates.map(width => candidate(width, height))
  const entries = [entry('A', make(320)), entry('B', make(320))]
  assert.deepEqual(packScorebook(entries), [{ start: 0, end: 2, width: 528, pageCount: 1 }])
  entries[1].candidates.find(item => item.width === 624).overlaps.push('lyric')
  assert.equal(packScorebook(entries).length, 2)
})

test('shared widths stop at 624px while solo selection can still choose 768px', () => {
  assert.equal(sharedWidthMaximum, 624)
  assert.deepEqual(sharedWidthCandidates, [528, 552, 576, 600, 624])
  const entries = ['A', 'B'].map(title => entry(title, widthCandidates.map(width => candidate(width, 250, 1,
    { qualityScore: width === 768 ? 10 : width === 720 ? 9 : width === 696 ? 8 : width === 576 ? 2 : 1 }))))
  assert.equal(chooseBestWidth(entries[0].candidates).width, 768)
  assert.equal(packScorebook(entries)[0].width, 576)
  assert.equal(optimizeScorebook(entries, new Set(['basics'])).groups[0].width, 576)
})

test('passing wider widths cannot bypass 624px admission', () => {
  for (const atAdmission of [candidate(624, 250, 2), candidate(624, 520)]) {
    const entries = ['A', 'B'].map(title => entry(title, [atAdmission, candidate(600, 250), candidate(768, 250)]))
    assert.equal(packScorebook(entries).length, 2)
    assert.equal(optimizeScorebook(entries, new Set(['basics'])).groups.length, 2)
  }
})

test('a shared page can use the admission width when it scores highest', () => {
  const entries = ['A', 'B'].map(title => entry(title, widthCandidates.map(width => candidate(width, 250, 1,
    { qualityScore: width === 624 ? 2 : .5 })) ))
  assert.equal(packScorebook(entries)[0].width, 624)
  entries[1].candidates.find(item => item.width === 624).outside.push('ink')
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
    { start: 0, end: 1, width: 600, pageCount: 2 }, { start: 1, end: 2, width: 600, pageCount: 1 },
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
  assert.equal(renderCache.uniqueWidths, 17)
  assert.equal(chooseBestWidth(candidates).width, 624)
})

test('scoring checks every formal width and chooses the best composite score', async () => {
  const result = await probeWidthCandidates(async width => candidate(width, 100, 1,
    { qualityScore: width === 648 ? 2 : .5 }))
  assert.deepEqual(result.candidates.map(item => item.width), [...widthCandidates, 630, 636, 642, 654, 660, 666])
  assert.equal(chooseBestWidth(result.candidates).width, 648)
  assert.equal(result.renderCache.uniqueWidths, 17)
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
  assert.equal(result.candidates.filter(c => c.error).length, 6)
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
  for (const index of [0, 39]) entries[index].candidates = [candidate(576, 200), candidate(600, 200), candidate(624, 200), candidate(672, 200), candidate(768, 200)]
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
  assert.deepEqual(widths, [528])
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
  assert.equal(result.renderCache.requests, 17)
})

test('cancellation between levels stops further measurements', async () => {
  const controller = new AbortController(), measured = []
  await assert.rejects(selectBestWidth(async width => {
    measured.push(width)
    if (width === 624) controller.abort()
    return candidate(width, 100)
  }, { signal: controller.signal }), { name: 'AbortError' })
  assert.deepEqual(measured, [528, 552, 576, 600, 624])
})

test('shared packing ignores off-level candidates outside the coarse winner neighborhood', () => {
  const entries = ['A', 'B'].map(title => entry(title, widthCandidates.map(width => candidate(width, 250))))
  for (const work of entries) work.candidates.push(candidate(618, 250, 1, { qualityScore: 100 }))
  assert.equal(packScorebook(entries)[0].width, 528)
  assert(sharedWidthCandidates.every(width => widthCandidates.includes(width) && width <= 624))
})

for (const coarseBest of [528, 648, 768]) {
  test(`6px refinement around ${coarseBest}px stays in bounds and finds a better width`, async () => {
    const fineBest = coarseBest === 768 ? 762 : coarseBest + 6
    const measured = []
    const result = await selectBestWidth(async width => {
      measured.push(width)
      return candidate(width, 100, 1, { qualityScore: width === fineBest ? 3 : width === coarseBest ? 2 : 1 })
    })
    assert.deepEqual(measured.slice(0, 11), widthCandidates)
    assert.equal(new Set(measured).size, measured.length)
    assert(measured.every(width => width >= 528 && width <= 768))
    assert.equal(result.best.width, fineBest)
    assert.equal(measured.length, coarseBest === 648 ? 17 : 14)
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
    if (width === 534) controller.abort()
    return candidate(width, 100)
  }, { signal: controller.signal }), { name: 'AbortError' })
  assert.deepEqual(measured, [...widthCandidates, 534])
})

const refinementEntries = () => ['A', 'B'].map(title => entry(title, widthCandidates.map(width =>
  candidate(width, 300, 1, { qualityScore: width === 768 ? 10 : width === 600 ? 2 : 1 }))))

test('sharing refines its own coarse winner and preserves independent solo candidates', async () => {
  const entries = refinementEntries(), original = structuredClone(entries), requests = []
  await refineSharedWidths(entries, async (work, width) => {
    requests.push(`${work.title}:${width}`)
    return candidate(width, 300, 1, { qualityScore: width === 606 ? 3 : 1 })
  })
  assert.equal(new Set(requests).size, requests.length)
  assert.equal(requests.length, 12)
  assert(entries.every((work, index) => JSON.stringify(work.candidates) === JSON.stringify(original[index].candidates)))
  assert.equal(chooseBestWidth(entries[0].candidates).width, 768)
  assert.equal(packScorebook(entries)[0].width, 606)
  await refineSharedWidths(entries, async () => { throw new Error('must reuse measured candidates') })
  assert.equal(packScorebook(entries)[0].width, 606)
})

test('every member must pass page count, capacity and safety checks at a refined shared width', async () => {
  for (const invalid of [{ pageCount: 2 }, { overlaps: ['lyric'] }, { naturalHeight: 900 }]) {
    const entries = refinementEntries()
    await refineSharedWidths(entries, async (work, width) => candidate(width, 300, 1,
      { qualityScore: width === 606 ? 3 : 1, ...(work.title === 'B' && width === 606 ? invalid : {}) }))
    assert.equal(packScorebook(entries)[0].width, 600)
  }
})

test('shared refinement includes distant legal groups but respects chapter anchors', async () => {
  const entries = refinementEntries()
  entries.splice(1, 0, entry('solo', widthCandidates.map(width => candidate(width, undefined, 2))))
  const measured = []
  const measure = async (work, width) => { measured.push(work.title); return candidate(width, 300) }
  await refineSharedWidths(entries, measure)
  assert.equal(measured.length, 0)
  await refineSharedWidths(entries, measure, { movableSections: new Set(['basics']) })
  assert.deepEqual(new Set(measured), new Set(['A', 'B']))
  const blocked = refinementEntries(); blocked[1].breakBefore = true
  await refineSharedWidths(blocked, async () => { throw new Error('must not cross an anchor') })
  assert(blocked.every(work => !work.sharedCandidates))
})

test('shared refinement is bounded by 528–624px and propagates cancellation', async () => {
  for (const winner of [528, 624]) {
    const entries = refinementEntries()
    for (const work of entries) for (const c of work.candidates) c.qualityScore = c.width === winner ? 2 : 1
    const widths = []
    await refineSharedWidths(entries, async (_work, width) => { widths.push(width); return candidate(width, 300) })
    assert(widths.length > 0)
    assert(widths.every(width => width >= 528 && width <= 624 && width % 6 === 0))
  }
  const controller = new AbortController()
  await assert.rejects(refineSharedWidths(refinementEntries(), async (_work, width) => {
    controller.abort(); return candidate(width, 300)
  }, { signal: controller.signal }), { name: 'AbortError' })
})

test('quality bounds prune only certified losers, including nonmonotonic pagination and narrow refinement wins', async () => {
  for (const winner of [528, 552, 624, 744]) {
    const measure = async width => candidate(width, 200, width < winner || width === winner + 6 ? 2 : 1,
      { lineDensityVariation: width === winner - 6 ? .01 : .15, lastLineSlack: .1 })
    const exhaustive = await selectBestWidth(measure)
    const pruned = await selectBestWidth(measure, { prune: true })
    assert.deepEqual(pruned.best, exhaustive.best)
    assert(pruned.renderCache.requests <= exhaustive.renderCache.requests)
    for (const width of pruned.renderCache.skippedWidths) {
      assert((528 / width) ** 2 < numberedLayoutScore(pruned.best))
    }
  }
  // One-page incumbents cannot certify a wider width with an equal upper bound.
  const ties = await selectBestWidth(async width => candidate(width, 200, 1,
    { qualityScore: width === 528 ? (528 / 552) ** 2 : (528 / width) ** 2 }), { prune: true })
  assert(ties.candidates.some(c => c.width === 552))
  const multi = await selectBestWidth(async width => candidate(width, undefined, 2), { prune: true })
  assert.equal(multi.renderCache.skippedWidths.length, 0)
})

test('audited search retains all candidates even when pruning was requested', async () => {
  const result = await probeWidthCandidates(async width => candidate(width, 200), {
    prune: true, verify: async () => ({}),
  })
  assert.equal(result.renderCache.requests, 14)
  assert.deepEqual(result.renderCache.skippedWidths, [])
})

test('hierarchical search fills the original 24px grid before 6px refinement, retaining isolated winners', async () => {
  const widths = []
  const measure = async width => {
    widths.push(width)
    // A single winning width between the 48px samples must not be lost.
    return candidate(width, 200, width === 600 ? 1 : 2)
  }
  const result = await selectBestWidth(measure, { prune: true })
  assert.deepEqual(widths.slice(0, 6), [528, 576, 624, 672, 720, 768])
  assert.equal(result.best.width, 600)
  assert(widths.includes(552) && widths.includes(600))
  assert(widths.slice(11).every(width => width % 6 === 0))
})

test('lazy solo and shared searches preserve exhaustive packing across adversarial canonical scores', async () => {
  let state = 14215
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32 }
  for (let trial = 0; trial < 60; trial++) {
    const tables = Array.from({ length: 6 }, () => new Map(Array.from({ length: 41 }, (_, i) => {
      const width = 528 + 6 * i
      return [width, candidate(width, 80 + random() * 470, random() < .2 ? 2 : 1, {
        lineDensityVariation: random() * .4, lastLineSlack: random() * .5,
        lineStretchPenalty: random() * .06, overlaps: random() < .03 ? ['ink'] : [],
      })]
    })))
    const full = [], lazy = [], requests = new Set()
    for (const [index, table] of tables.entries()) {
      const a = await selectBestWidth(async width => table.get(width))
      const b = await selectBestWidth(async width => table.get(width), { prune: true })
      assert.deepEqual(b.best, a.best)
      const settings = { title: String(index), section: index < 4 ? 'basics' : 'next', sharePage: index !== 3 || trial % 3 !== 0 }
      full.push({ ...settings, candidates: a.candidates })
      lazy.push({ ...settings, candidates: b.candidates })
      for (const c of b.candidates) requests.add(`${index}:${c.width}`)
    }
    const movableSections = trial % 2 ? new Set(['basics']) : new Set()
    await refineSharedWidths(full, async (work, width) => tables[Number(work.title)].get(width), { movableSections })
    await refineSharedWidths(lazy, async (work, width) => {
      const key = `${work.title}:${width}`
      assert(!requests.has(key), 'same score and width must never be measured twice')
      requests.add(key)
      return tables[Number(work.title)].get(width)
    }, { movableSections, prune: true })
    const a = optimizeScorebook(full, movableSections), b = optimizeScorebook(lazy, movableSections)
    assert.deepEqual(b.groups, a.groups)
    assert.deepEqual(b.metrics, a.metrics)
    assert.deepEqual(b.entries.map(e => e.title), a.entries.map(e => e.title))
    assert.deepEqual(lazy.map(e => chooseBestWidth(e.candidates)), full.map(e => chooseBestWidth(e.candidates)))
  }
})


test('horizontal rejection uses the incumbent, preserves request counts and cancellation', async () => {
  const result = await selectBestWidth(async (width, best) => {
    if (best && width !== 534) throw new WidthSearchPruned()
    return candidate(width, 200, 1, { lineDensityVariation: .5 })
  }, { prune: true })
  assert.equal(result.best.width, 528)
  assert.equal(result.candidates.length, 2)
  assert(result.renderCache.requests > result.candidates.length)
  const controller = new AbortController()
  await assert.rejects(selectBestWidth(async () => {
    controller.abort(); throw new WidthSearchPruned()
  }, { prune: true, signal: controller.signal }), { name: 'AbortError' })
})
