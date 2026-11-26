import { scoreLayoutConfig } from '@m3n/numbered-notation/layout-config'
import { chooseBestWidth, numberedLayoutScore, widthCandidates, widthMinimum, widthCannotWin, widthQualityUpperBound } from './scorebook-width.mjs'

// Keep at least 1.25 default core gaps between scores (currently 36 logical px); never compress this to fit more works.
export const sharedScoreGap = scoreLayoutConfig.scorebook.sharedScoreGap
export const sharedPreferredWidth = widthMinimum
export const sharedWidthMaximum = scoreLayoutConfig.pageWidth.unit * scoreLayoutConfig.pageWidth.sharedMaximumMultiple
export const sharedWidthCandidates = widthCandidates.filter(width => width <= sharedWidthMaximum)
export const packingPolicy = Object.freeze({ targetFill: .75, sparseBelow: .65, crowdedAbove: .85,
  sparseWeight: 8, crowdedWeight: 6, balanceWeight: 1, pageWeight: 1 })
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
  return { members: [index], width: solo.width, pageCount: solo.pageCount, fill, qualityScore: numberedLayoutScore(solo) }
}

function sharedOption(entries, members, refine = true) {
  if (members.length < 2) return null
  if (members.some(index => entries[index].sharePage === false)) return null
  // Sharing eligibility is checked at the configured admission level, independently of the solo search. Once a group passes,
  // choose its highest-quality common width.
  const eligible = members.map(index => candidateAt(entries[index], sharedWidthMaximum))
  if (eligible.some(candidate => !candidate || !safe(candidate) || candidate.pageCount !== 1 || !Number.isFinite(candidate.naturalHeight))) return null
  const eligibilityHeight = eligible.reduce((sum, candidate) => sum + candidate.naturalHeight, sharedScoreGap * (members.length - 1))
  if (eligibilityHeight > capacity(sharedWidthMaximum) + .001) return null
  const optionAt = width => {
    const candidates = members.map(index => candidateAt(entries[index], width))
    if (candidates.some(candidate => !candidate || !safe(candidate) || candidate.pageCount !== 1 || !Number.isFinite(candidate.naturalHeight))) return null
    const usedHeight = candidates.reduce((sum, candidate) => sum + candidate.naturalHeight, sharedScoreGap * (members.length - 1))
    if (usedHeight > capacity(width) + .001) return null
    const qualityScore = candidates.reduce((sum, candidate) => sum + numberedLayoutScore(candidate), 0) / candidates.length
    return { members, width, pageCount: 1, fill: usedHeight / capacity(width), qualityScore, outside: [], overlaps: [] }
  }
  const coarse = chooseBestWidth(sharedWidthCandidates.map(optionAt).filter(Boolean))
  if (!coarse || !refine) return coarse
  const widths = sharedRefinementWidths(coarse.width)
  return chooseBestWidth([coarse, ...widths.map(optionAt).filter(Boolean)])
}

const sharedRefinementWidths = width => {
  const lower = Math.max(widthMinimum, width - scoreLayoutConfig.pageWidth.unit)
  const upper = Math.min(sharedWidthMaximum, width + scoreLayoutConfig.pageWidth.unit)
  return Array.from({ length: (upper - lower) / 6 + 1 }, (_, index) => lower + index * 6)
}

/** Exact lazy search: admission remains independent of solo ranking. Missing
 * widths are measured only for groups that pass admission, and skipped only
 * after the same quality bound proves they cannot replace a feasible winner. */
async function refinePrunedSharedWidths(entries, measure, movableSections, signal) {
  const ensure = async (index, width) => {
    signal?.throwIfAborted()
    const entry = entries[index]
    if (candidateAt(entry, width)) return
    let candidate
    try { candidate = { width, ...await measure(entry, width) } }
    catch (error) { candidate = { width, error: error.message } }
    signal?.throwIfAborted()
    entry.sharedCandidates ??= []
    entry.sharedCandidates.push(candidate)
  }
  const admission = members => {
    const candidates = members.map(index => candidateAt(entries[index], sharedWidthMaximum))
    return candidates.every(candidate => candidate && safe(candidate) && candidate.pageCount === 1 && Number.isFinite(candidate.naturalHeight))
      && candidates.reduce((sum, candidate) => sum + candidate.naturalHeight, sharedScoreGap * (members.length - 1)) <= capacity(sharedWidthMaximum) + .001
  }
  const visit = async members => {
    if (!admission(members)) return false
    let best = null
    const measureAt = async width => {
      let height = sharedScoreGap * (members.length - 1)
      // Reuse known members first. An invalid member or already excessive
      // partial height proves the group cannot fit; the rest need no layout.
      const order = [...members].sort((a, b) => Number(Boolean(candidateAt(entries[b], width))) - Number(Boolean(candidateAt(entries[a], width))))
      for (const index of order) {
        if (best) {
          const bound = members.reduce((sum, member) => {
            const candidate = candidateAt(entries[member], width)
            return sum + (candidate && safe(candidate) ? numberedLayoutScore(candidate) : widthQualityUpperBound(width))
          }, 0) / members.length
          if (bound < numberedLayoutScore(best)) return
        }
        await ensure(index, width)
        const candidate = candidateAt(entries[index], width)
        if (!safe(candidate) || candidate.pageCount !== 1 || !Number.isFinite(candidate.naturalHeight)) return
        height += candidate.naturalHeight
        if (height > capacity(width) + .001) return
      }
    }
    const coarseOrder = [...sharedWidthCandidates.filter((_, index) => index % 2 === 0),
      ...sharedWidthCandidates.filter((_, index) => index % 2 === 1)]
    for (const width of coarseOrder) {
      if (widthCannotWin(width, best)) continue
      await measureAt(width)
      best = sharedOption(entries, members, false)
    }
    const coarse = best
    if (!coarse) throw new Error('Admission width must be a feasible shared candidate')
    for (const width of sharedRefinementWidths(coarse.width)) {
      if (widthCannotWin(width, best)) continue
      await measureAt(width)
      best = sharedOption(entries, members)
    }
    return true
  }
  for (let start = 0; start < entries.length;) {
    signal?.throwIfAborted()
    let end = start + 1
    if (entries[start].sharePage !== false) {
      while (end < entries.length && entries[end].section === entries[start].section
        && !entries[end].breakBefore && entries[end].sharePage !== false) end++
    }
    if (end - start > 1) {
      for (let index = start; index < end; index++) await ensure(index, sharedWidthMaximum)
      if (movableSections.has(entries[start].section)) {
        const eligible = Array.from({ length: end - start }, (_, offset) => start + offset).filter(index => admission([index]))
        const enumerate = async (members, from) => {
          for (let index = from; index < eligible.length; index++) {
            const next = [...members, eligible[index]]
            if (next.length > 1 && !await visit(next)) continue
            await enumerate(next, index + 1)
          }
        }
        await enumerate([], 0)
      } else {
        for (let first = start; first < end; first++) {
          for (let last = first + 2; last <= end; last++) {
            if (!await visit(Array.from({ length: last - first }, (_, offset) => first + offset))) break
          }
        }
      }
    }
    start = end
  }
}

/** Measure the neighbors of every feasible group's coarse winner, before
 * chapter packing. Supplemental candidates never change solo width selection. */
export async function refineSharedWidths(entries, measure, { movableSections = new Set(), signal, prune = false } = {}) {
  if (prune) return refinePrunedSharedWidths(entries, measure, movableSections, signal)
  const requests = new Map()
  const visit = members => {
    signal?.throwIfAborted()
    const coarse = sharedOption(entries, members, false)
    if (!coarse) return false
    for (const index of members) for (const width of sharedRefinementWidths(coarse.width)) {
      const entry = entries[index]
      if (entry.candidates.some(candidate => candidate.width === width)
        || entry.sharedCandidates?.some(candidate => candidate.width === width)) continue
      const widths = requests.get(index) ?? new Set()
      widths.add(width); requests.set(index, widths)
    }
    return true
  }
  for (let start = 0; start < entries.length;) {
    signal?.throwIfAborted()
    let end = start + 1
    if (entries[start].sharePage !== false) {
      while (end < entries.length && entries[end].section === entries[start].section
        && !entries[end].breakBefore && entries[end].sharePage !== false) end++
    }
    if (movableSections.has(entries[start].section)) {
      const eligible = Array.from({ length: end - start }, (_, offset) => start + offset).filter(index => {
        const candidate = entries[index].candidates.find(candidate => candidate.width === sharedWidthMaximum)
        return entries[index].sharePage !== false && candidate && safe(candidate) && candidate.pageCount === 1
          && Number.isFinite(candidate.naturalHeight)
      })
      const enumerate = (members, from) => {
        for (let index = from; index < eligible.length; index++) {
          const next = [...members, eligible[index]]
          if (next.length > 1 && !visit(next)) continue
          enumerate(next, index + 1)
        }
      }
      enumerate([], 0)
    } else {
      for (let first = start; first < end; first++) {
        for (let last = first + 2; last <= end; last++) {
          if (!visit(Array.from({ length: last - first }, (_, offset) => first + offset))) break
        }
      }
    }
    start = end
  }
  for (const [index, widths] of requests) for (const width of widths) {
    signal?.throwIfAborted()
    let candidate
    try { candidate = { width, ...await measure(entries[index], width) } }
    catch (error) { candidate = { width, error: error.message } }
    signal?.throwIfAborted()
    entries[index].sharedCandidates ??= []
    entries[index].sharedCandidates.push(candidate)
  }
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
    const candidate = candidateAt(entry, sharedWidthMaximum)
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
function optimize(entries, movableSections) {
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

export function optimizeScorebook(entries, movableSections = new Set()) {
  return optimize(entries, movableSections)
}
