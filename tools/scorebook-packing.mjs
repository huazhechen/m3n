import { scoreLayoutConfig } from '@m3n/numbered-notation/layout-config'
import { chooseBestWidth, numberedLayoutScore, widthMinimum } from './scorebook-width.mjs'

// Keep at least 1.25 default core gaps between scores (currently 36 logical px); never compress this to fit more works.
export const sharedScoreGap = scoreLayoutConfig.scorebook.sharedScoreGap
export const sharedPreferredWidth = widthMinimum
export const sharedWidthMaximum = scoreLayoutConfig.pageWidth.unit * scoreLayoutConfig.pageWidth.sharedMaximumMultiple
export const sharedWidthCandidates = Array.from({ length: (sharedWidthMaximum - widthMinimum) / 6 + 1 }, (_, index) => widthMinimum + index * 6)
export const packingPolicy = Object.freeze({ targetFill: .75, sparseBelow: .65, crowdedAbove: .85,
  sparseWeight: 8, crowdedWeight: 6, balanceWeight: 1, pageWeight: 1, qualityWeight: 1 })
const safe = candidate => !candidate.error && candidate.pageCount > 0 && !candidate.outside.length && !candidate.overlaps.length
const capacity = width => Math.floor(width * 273 / 186)
const candidateAt = (entry, width) => entry.sharedCandidates?.find(candidate => candidate.width === width)
  ?? entry.candidates.find(candidate => candidate.width === width)

/** Score natural content at the source minimum core gap, before stretching page spacing. */
export function pageDensityPenalty(fill) {
  if (!Number.isFinite(fill)) return 0 // Multi-page solos have no continuous height measurement.
  const p = packingPolicy
  return p.sparseWeight * Math.max(0, p.sparseBelow - fill) ** 2
    + p.crowdedWeight * Math.max(0, fill - p.crowdedAbove) ** 2
    + p.balanceWeight * (fill - p.targetFill) ** 2
}

function soloOption(entry, index) {
  const solo = chooseBestWidth(entry.candidates)
  if (!solo) throw new Error(`No safe layout: ${entry.title}`)
  const fill = solo.pageCount === 1 && Number.isFinite(solo.naturalHeight) ? solo.naturalHeight / capacity(solo.width) : undefined
  return { members: [index], width: solo.width, pageCount: solo.pageCount, fill, readingCost: readingCost(solo) }
}

// The inverse quality transform recovers the additive engraving/font cost for
// both current candidates and the compatible quality-only measurement format.
const readingCost = candidate => candidate.totalCost ?? (1 / numberedLayoutScore(candidate) - 1)

function sharedOptions(entries, members) {
  if (members.length < 2 || members.some(index => entries[index].sharePage === false)) return []
  return sharedWidthCandidates.flatMap(width => {
    const candidates = members.map(index => candidateAt(entries[index], width))
    if (candidates.some(candidate => !candidate || !safe(candidate) || candidate.pageCount !== 1 || !Number.isFinite(candidate.naturalHeight))) return []
    const usedHeight = candidates.reduce((sum, candidate) => sum + candidate.naturalHeight, sharedScoreGap * (members.length - 1))
    if (usedHeight > capacity(width) + .001) return []
    return [{ members, width, pageCount: 1, fill: usedHeight / capacity(width),
      readingCost: candidates.reduce((sum, candidate) => sum + readingCost(candidate), 0) / candidates.length }]
  })
}

/** Chapters and explicit page-break anchors bound the search. Solo-only works
 * remain movable: an opt-out prohibits sharing, not pairing works around it. */
function* segments(entries) {
  for (let start = 0; start < entries.length;) {
    let end = start + 1
    while (end < entries.length && entries[end].section === entries[start].section && !entries[end].breakBefore) end++
    yield [start, end]
    start = end
  }
}

/** Complete 6px shared grid, independent of solo ranking. No single width is
 * an admission gate. Pruning uses only exact known capacity/safety facts; a
 * quality bound alone cannot discard a different page-density tradeoff. */
export async function refineSharedWidths(entries, measure, { signal, prune = false } = {}) {
  signal?.throwIfAborted()
  for (const [start, end] of segments(entries)) {
    const members = Array.from({ length: end - start }, (_, index) => start + index)
      .filter(index => entries[index].sharePage !== false)
    if (members.length < 2) continue
    // Finish one score before moving on, preserving the local renderer's
    // parsing and measurement-task reuse across widths.
    for (const index of members) for (const width of sharedWidthCandidates) {
      signal?.throwIfAborted()
      const entry = entries[index]
      if (candidateAt(entry, width)) continue
      if (prune) {
        // This member is unknown, so its safe height lower bound is zero.
        // Every possible group needs at least one partner plus the hard gap.
        if (!members.some(other => {
          if (other === index) return false
          const candidate = candidateAt(entries[other], width)
          return !candidate || (safe(candidate) && candidate.pageCount === 1 && Number.isFinite(candidate.naturalHeight)
            && candidate.naturalHeight + sharedScoreGap <= capacity(width) + .001)
        })) continue
      }
      let candidate
      try { candidate = { width, ...await measure(entry, width) } }
      catch (error) { candidate = { width, error: error.message } }
      signal?.throwIfAborted()
      entry.sharedCandidates ??= []
      entry.sharedCandidates.push(candidate)
    }
  }
}

const empty = () => ({ cost: 0, pages: 0, density: 0, readingCost: 0, groups: [] })
function prepend(group, tail) {
  const density = pageDensityPenalty(group.fill)
  return { cost: packingPolicy.pageWeight * group.pageCount + density + packingPolicy.qualityWeight * group.readingCost + tail.cost,
    pages: group.pageCount + tail.pages, density: density + tail.density,
    readingCost: group.readingCost + tail.readingCost,
    groups: [group, ...tail.groups] }
}
function better(a, b) {
  if (!b) return true
  for (const key of ['pages', 'cost']) {
    if (Math.abs(a[key] - b[key]) > 1e-9) return a[key] < b[key]
  }
  // Deterministic ties: preserve earlier works and prefer smaller first groups.
  const x = a.groups.flatMap(group => group.members), y = b.groups.flatMap(group => group.members)
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]
  for (let i = 0; i < a.groups.length; i++) {
    if (a.groups[i].members.length !== b.groups[i].members.length) return a.groups[i].members.length < b.groups[i].members.length
    if (a.groups[i].width !== b.groups[i].width) return a.groups[i].width < b.groups[i].width
  }
  return false
}

/** Knuth–Plass-style whole-sequence DP; works remain complete and ordered. */
function orderedPacking(entries) {
  const best = Array(entries.length + 1)
  best[entries.length] = empty()
  for (let start = entries.length - 1; start >= 0; start--) {
    best[start] = prepend(soloOption(entries[start], start), best[start + 1])
    for (let end = start + 2; end <= entries.length; end++) {
      const next = entries[end - 1]
      if (next.section !== entries[start].section || next.breakBefore || next.sharePage === false || entries[start].sharePage === false) break
      const groups = sharedOptions(entries, Array.from({ length: end - start }, (_, index) => start + index))
      if (!groups.length) break // At every grid width, adding positive heights cannot repair infeasibility.
      for (const group of groups) {
        const option = prepend(group, best[end])
        if (better(option, best[start])) best[start] = option
      }
    }
  }
  return best[0]
}

/** Exact set partitioning via subset DP, equivalent to choosing one covering group per work. */
function unorderedPacking(entries) {
  const bits = entries.map((_, index) => 1n << BigInt(index))
  const indexes = new Map(bits.map((bit, index) => [bit, index]))
  const choices = Array.from({ length: entries.length }, (_, index) => [soloOption(entries[index], index)])
  const eligible = entries.flatMap((entry, index) => entry.sharePage !== false
    && sharedWidthCandidates.some(width => {
      const candidate = candidateAt(entry, width)
      return candidate && safe(candidate) && candidate.pageCount === 1 && Number.isFinite(candidate.naturalHeight)
    }) ? [index] : [])
  // Only enumerate feasible groups; oversized prefixes need no supersets.
  function enumerate(members, from) {
    for (let i = from; i < eligible.length; i++) {
      const next = [...members, eligible[i]]
      const groups = next.length > 1 ? sharedOptions(entries, next) : []
      if (next.length > 1 && !groups.length) continue
      const mask = next.reduce((mask, index) => mask | bits[index], 0n)
      for (const group of groups) choices[next[0]].push({ ...group, mask })
      enumerate(next, i + 1)
    }
  }
  enumerate([], 0)
  for (let index = 0; index < entries.length; index++) choices[index][0].mask = bits[index]
  // Store only reachable partitions, rather than allocating 2^chapterSize slots.
  // BigInt masks keep distant works distinct beyond the 32-bit bitwise boundary.
  const best = new Map([[0n, empty()]])
  function solve(mask) {
    if (best.has(mask)) return best.get(mask)
    const first = indexes.get(mask & -mask)
    let winner
    for (const group of choices[first]) {
      if ((group.mask & mask) !== group.mask) continue
      const option = prepend(group, solve(mask ^ group.mask))
      if (better(option, winner)) winner = option
    }
    best.set(mask, winner)
    return winner
  }
  return solve((1n << BigInt(entries.length)) - 1n)
}

/** Chapters and explicit anchors bound independently optimized segments. */
function optimize(entries, movableSections) {
  const selected = []
  for (const [start, end] of segments(entries)) {
    const segment = entries.slice(start, end)
    const result = movableSections.has(entries[start].section) ? unorderedPacking(segment) : orderedPacking(segment)
    selected.push(...result.groups.map(group => ({ ...group, members: group.members.map(index => index + start) })))
  }
  const ordered = selected.flatMap(group => group.members.map(index => entries[index]))
  let start = 0
  const groups = selected.map(group => {
    const packed = { start, end: start + group.members.length, width: group.width, pageCount: group.pageCount }
    start = packed.end
    return packed
  })
  return { entries: ordered, groups, metrics: {
    cost: selected.reduce((sum, group) => sum + packingPolicy.pageWeight * group.pageCount + pageDensityPenalty(group.fill) + packingPolicy.qualityWeight * group.readingCost, 0),
    readingCost: selected.reduce((sum, group) => sum + group.readingCost, 0),
    pages: selected.reduce((sum, group) => sum + group.pageCount, 0),
    densityPenalty: selected.reduce((sum, group) => sum + pageDensityPenalty(group.fill), 0),
    pageGroups: selected.map(group => ({ titles: group.members.map(index => entries[index].title), width: group.width, pageCount: group.pageCount, naturalFill: group.fill ?? null })),
  } }
}

export function packScorebook(entries) { return optimizeScorebook(entries).groups }
export function reorderForSharing(entries, movableSections = new Set(entries.map(entry => entry.section))) {
  return optimizeScorebook(entries, movableSections).entries
}

export function optimizeScorebook(entries, movableSections = new Set()) {
  return optimize(entries, movableSections)
}
