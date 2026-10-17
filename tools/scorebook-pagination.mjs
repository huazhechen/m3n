const EPSILON = 1e-6

export function paginateScorebookLayout(layout, entry, { bodyHeight, scale, minimumFillPercent = 0 }) {
  const cuts = layout.cuts, n = layout.rows, cap = bodyHeight / scale
  const fits = (start, end) => {
    const used = cuts[end] - cuts[start] + (start ? 36 : 0)
    const sharedWhole = entry.sharePage && start === 0 && end === n
    return used <= cap + EPSILON && (sharedWhole || used / cap * 100 > minimumFillPercent)
  }
  if (entry.pageBreaks?.length) {
    const ends = [...entry.pageBreaks, n], ranges = []
    let start = 0
    for (const end of ends) {
      if (!(end > start && end <= n)) throw new Error('Invalid manual scorebook page break')
      if (!fits(start, end)) return null
      ranges.push([start, end]); start = end
    }
    if (entry.pageCount && ranges.length !== entry.pageCount) return null
    return ranges
  }
  const memo = new Map()
  function solve(start, remaining = entry.pageCount ?? null) {
    if (start === n) return remaining === null || remaining === 0 ? { cost: 0, ranges: [] } : null
    if (remaining !== null && remaining <= 0) return null
    const key = `${start}/${remaining}`
    if (memo.has(key)) return memo.get(key)
    let best = null
    for (let end = start + 1; end <= n; end++) {
      const used = cuts[end] - cuts[start] + (start ? 36 : 0)
      if (used > cap + EPSILON) break
      if (start > 0 && end - start < 3 || !fits(start, end)) continue
      const next = solve(end, remaining === null ? null : remaining - 1)
      if (!next) continue
      const cost = 100 + ((cap - used) / cap) ** 2 * 10 + next.cost
      if (!best || cost < best.cost) best = { cost, ranges: [[start, end], ...next.ranges] }
    }
    memo.set(key, best); return best
  }
  return solve(0)?.ranges ?? null
}

// Choose the common note size and the grouping together. A short score may be
// below the floor on its own, but every completed page must clear the floor.
export function packScorebookGroup(group, { bodyHeight, shortGap, renderScale, minimumFillPercent = 0, maximumSharedWidth = Infinity }) {
  const memo = new Map()
  function pack(start) {
    if (start === group.length) return { cost: 0, pages: [] }
    if (memo.has(start)) return memo.get(start)
    let best = null
    for (let end = start + 1; end <= group.length; end++) {
      for (const width of group[start].sharedLayouts.keys()) {
        if (end - start > 1 && width > maximumSharedWidth) continue
        const layouts = group.slice(start, end).map(entry => entry.sharedLayouts.get(width))
        if (layouts.some(layout => !layout)) continue
        const used = layouts.reduce((sum, layout) => sum + layout.height * renderScale(width), 0) + (end - start - 1) * shortGap
        if (used > bodyHeight + EPSILON || used / bodyHeight * 100 <= minimumFillPercent) continue
        const next = pack(end)
        if (!next) continue
        const cost = 1000 + width * 0.1 + ((bodyHeight - used) / bodyHeight) ** 2 * 10 + next.cost
        if (!best || cost < best.cost) best = { cost, pages: [{ start, end, layouts, used }, ...next.pages] }
      }
    }
    memo.set(start, best); return best
  }
  return pack(0)?.pages ?? null
}
