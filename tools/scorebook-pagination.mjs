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
export function packScorebookGroup(group, { bodyHeight, shortGap, renderScale, minimumFillPercent = 0, maximumSharedWidth = Infinity, priority, keepTogether = false }) {
  const memo = new Map()
  function pack(start) {
    if (start === group.length) return { cost: 0, pages: [] }
    if (memo.has(start)) return memo.get(start)
    let best = null
    for (let end = keepTogether ? group.length : start + 1; end <= group.length; end++) {
      for (const width of group[start].sharedLayouts.keys()) {
        if (end - start > 1 && width > maximumSharedWidth) continue
        let states=[{used:0,layouts:[],gapCost:0}]
        for(const entry of group.slice(start,end)) {
          const choices=entry.sharedLayoutVariants?.get(width)??[entry.sharedLayouts.get(width)].filter(Boolean)
          const buckets=new Map()
          for(const state of states)for(const layout of choices) {
            if(state.layouts.length&&(state.layouts[0].systemGap??18)!==(layout.systemGap??18))continue
            const used=state.used+layout.height*renderScale(width)+(state.layouts.length?shortGap:0)
            if(used>bodyHeight+EPSILON)continue
            const gapCost=state.gapCost+Math.abs((layout.systemGap??18)-18)
            const key=Math.round(used*10),old=buckets.get(key)
            if(!old||gapCost<old.gapCost)buckets.set(key,{used,layouts:[...state.layouts,layout],gapCost})
          }
          states=[...buckets.values()]
        }
        const fitting=states.filter(s=>s.used/bodyHeight*100>minimumFillPercent)
          .sort((a,b)=>a.gapCost-b.gapCost||b.used-a.used)[0]
        if(!fitting)continue
        const {used,layouts}=fitting
        const next = pack(end)
        if (!next) continue
        const cost = (priority === 'font' ? width * (end-start) * 1e6 : width * 0.1) + 1000 + fitting.gapCost * 0.01 + ((bodyHeight - used) / bodyHeight) ** 2 * 10 + next.cost
        if (!best || cost < best.cost) best = { cost, pages: [{ start, end, layouts, used }, ...next.pages] }
      }
    }
    memo.set(start, best); return best
  }
  return pack(0)?.pages ?? null
}

// A shared page uses the book's common music style. Per-work spacing overrides
// remain available to standalone pages, where they cannot conflict with a neighbour.
export function scorebookPageStyle(entry, defaults) {
 const style = {}
 for (const key of ['noteGapEm','minimumNoteGapEm','uniformSystemHeight']) {
  style[key] = entry.sharePage ? defaults[key] : entry[key] ?? defaults[key]
 }
 return style
}

export function validateScorebookStyles(pages) {
 const byWork=new Map()
 const keys=['width','systemGap','noteGapEm','minimumNoteGapEm','uniformSystemHeight']
 for(const items of pages) {
  let pageStyle
  for(const {id,style} of items) {
   const signature=JSON.stringify(keys.map(key=>style[key]))
   if(pageStyle!==undefined&&pageStyle!==signature)throw new Error('All scores on one page must share one music style')
   if(byWork.has(id)&&byWork.get(id)!==signature)throw new Error('All pages of one score must share one music style: '+id)
   pageStyle=signature;byWork.set(id,signature)
  }
 }
}
