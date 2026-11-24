import { chooseBestWidth, numberedLayoutScore, widthCandidates, widthMinimum } from './scorebook-width.mjs'

// Keep at least 32 logical px between scores; never compress this to fit more works.
export const sharedScoreGap = 32
export const sharedPreferredWidth = widthMinimum
export const sharedWidthMaximum = 640
export const sharedWidthCandidates = widthCandidates.filter(width => width <= sharedWidthMaximum)
export const packingPolicy = Object.freeze({ targetFill: .75, sparseBelow: .65, crowdedAbove: .85,
  sparseWeight: 8, crowdedWeight: 6, balanceWeight: 1, pageWeight: 1 })
const safe = candidate => !candidate.error && candidate.pageCount > 0 && !candidate.outside.length && !candidate.overlaps.length
const capacity = width => Math.floor(width * 273 / 186)

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
  return { members: [index], width: solo.width, pageCount: solo.pageCount, fill, qualityScore: numberedLayoutScore(solo) }
}

function sharedOption(entries, members) {
  if (members.length < 2) return null
  if (members.some(index => entries[index].sharePage === false)) return null
  // Sharing eligibility is checked at 640px, independently of the solo search. Once a group passes,
  // choose its highest-quality common width.
  const eligible = members.map(index => entries[index].candidates.find(candidate => candidate.width === sharedWidthMaximum))
  if (eligible.some(candidate => !candidate || !safe(candidate) || candidate.pageCount !== 1 || !Number.isFinite(candidate.naturalHeight))) return null
  const eligibilityHeight = eligible.reduce((sum, candidate) => sum + candidate.naturalHeight, sharedScoreGap * (members.length - 1))
  if (eligibilityHeight > capacity(sharedWidthMaximum) + .001) return null
  const options = []
  for (const width of sharedWidthCandidates) {
    const candidates = members.map(index => entries[index].candidates.find(candidate => candidate.width === width))
    if (candidates.some(candidate => !candidate || !safe(candidate) || candidate.pageCount !== 1 || !Number.isFinite(candidate.naturalHeight))) continue
    const usedHeight = candidates.reduce((sum, candidate) => sum + candidate.naturalHeight, sharedScoreGap * (members.length - 1))
    if (usedHeight > capacity(width) + .001) continue
    const qualityScore = candidates.reduce((sum, candidate) => sum + numberedLayoutScore(candidate), 0) / candidates.length
    const option = { members, width, pageCount: 1, fill: usedHeight / capacity(width), qualityScore }
    options.push(option)
  }
  const selected = chooseBestWidth(options.map(option => ({ ...option, outside: [], overlaps: [] })))
  return selected ? options.find(option => option.width === selected.width) : null
}

const empty = () => ({ cost: 0, pages: 0, density: 0, qualityCost: 0, groups: [] })
function prepend(group, tail) {
  const density = pageDensityPenalty(group.fill)
  return { cost: packingPolicy.pageWeight * group.pageCount + density + tail.cost,
    pages: group.pageCount + tail.pages, density: density + tail.density,
    qualityCost: (group.qualityScore ?? 0) + tail.qualityCost,
    groups: [group, ...tail.groups] }
}
function better(a, b) {
  if (!b) return true
  for (const key of ['cost', 'pages']) {
    if (Math.abs(a[key] - b[key]) > 1e-9) return a[key] < b[key]
  }
  if (Math.abs(a.qualityCost - b.qualityCost) > 1e-9) return a.qualityCost > b.qualityCost
  // Deterministic ties: preserve earlier works and prefer smaller first groups.
  const x = a.groups.flatMap(group => group.members), y = b.groups.flatMap(group => group.members)
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]
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
      const group = sharedOption(entries, Array.from({ length: end - start }, (_, index) => start + index))
      if (!group) break // Positive heights mean adding further works cannot repair capacity or safety.
      const option = prepend(group, best[end])
      if (better(option, best[start])) best[start] = option
    }
  }
  return best[0]
}

/** Exact set partitioning via subset DP, equivalent to choosing one covering group per work. */
function unorderedPacking(entries) {
  const bits = entries.map((_, index) => 1n << BigInt(index))
  const indexes = new Map(bits.map((bit, index) => [bit, index]))
  const choices = Array.from({ length: entries.length }, (_, index) => [soloOption(entries[index], index)])
  const eligible = entries.flatMap((entry, index) => {
    const candidate = entry.candidates.find(item => item.width === sharedWidthMaximum)
    return entry.sharePage !== false && candidate && safe(candidate) && candidate.pageCount === 1 && Number.isFinite(candidate.naturalHeight) ? [index] : []
  })
  // Only enumerate feasible groups; oversized prefixes need no supersets.
  function enumerate(members, from) {
    for (let i = from; i < eligible.length; i++) {
      const next = [...members, eligible[i]]
      const group = next.length > 1 ? sharedOption(entries, next) : null
      if (next.length > 1 && !group) continue
      if (group) choices[next[0]].push({ ...group, mask: next.reduce((mask, index) => mask | bits[index], 0n) })
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
export function optimizeScorebook(entries, movableSections = new Set()) {
  const selected = []
  for (let start = 0; start < entries.length;) {
    let end = start + 1
    if (entries[start].sharePage !== false) {
      while (end < entries.length && entries[end].section === entries[start].section && !entries[end].breakBefore && entries[end].sharePage !== false) end++
    }
    const segment = entries.slice(start, end)
    const result = movableSections.has(entries[start].section) ? unorderedPacking(segment) : orderedPacking(segment)
    selected.push(...result.groups.map(group => ({ ...group, members: group.members.map(index => index + start) })))
    start = end
  }
  const ordered = selected.flatMap(group => group.members.map(index => entries[index]))
  let start = 0
  const groups = selected.map(group => {
    const packed = { start, end: start + group.members.length, width: group.width, pageCount: group.pageCount }
    start = packed.end
    return packed
  })
  return { entries: ordered, groups, metrics: {
    cost: selected.reduce((sum, group) => sum + group.pageCount + pageDensityPenalty(group.fill), 0),
    pages: selected.reduce((sum, group) => sum + group.pageCount, 0),
    densityPenalty: selected.reduce((sum, group) => sum + pageDensityPenalty(group.fill), 0),
    pageGroups: selected.map(group => ({ titles: group.members.map(index => entries[index].title), width: group.width, pageCount: group.pageCount, naturalFill: group.fill ?? null })),
  } }
}

export function packScorebook(entries) { return optimizeScorebook(entries).groups }
export function reorderForSharing(entries, movableSections = new Set(entries.map(entry => entry.section))) {
  return optimizeScorebook(entries, movableSections).entries
}
