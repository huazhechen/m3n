import { chooseBestWidth } from './scorebook-width.mjs'

export const sharedScoreGap = 22
export const sharedScoreWidth = 640
export const sharedPreferredWidth = 540
const safe = candidate => !candidate.error && candidate.stable !== false && candidate.pageCount > 0 && !candidate.outside.length && !candidate.overlaps.length

/** Preserve order and whole works. Minimize pages, then summed source widths. */
export function packScorebook(entries) {
  const best = Array(entries.length + 1)
  best[entries.length] = { pages: 0, widthCost: 0, groups: [] }
  for (let start = entries.length - 1; start >= 0; start--) {
    const solo = chooseBestWidth(entries[start].candidates)
    if (!solo) throw new Error(`No safe layout: ${entries[start].title}`)
    const next = best[start + 1]
    best[start] = { pages: solo.pageCount + next.pages, widthCost: solo.width + next.widthCost,
      groups: [{ start, end: start + 1, width: solo.width, pageCount: solo.pageCount }, ...next.groups] }
    if (entries[start].sharePage === false) continue
    for (const width of [sharedScoreWidth]) {
      let height = 0
      const probeHeights = new Map()
      for (let end = start; end < entries.length; end++) {
        const entry = entries[end]
        if (entry.section !== entries[start].section || entry.sharePage === false || end > start && entry.breakBefore) break
        const candidate = entry.candidates.find(item => item.width === width && safe(item) && item.pageCount === 1 && Number.isFinite(item.naturalHeight))
        if (!candidate) break
        height += candidate.naturalHeight + (end > start ? sharedScoreGap : 0)
        if (height > Math.floor(width * 273 / 186) + .001) break
        let stableGroup = true
        for (const probe of candidate.stabilityCases ?? [candidate]) {
          const used = (probeHeights.get(probe.width) ?? 0) + probe.naturalHeight + (end > start ? sharedScoreGap : 0)
          probeHeights.set(probe.width, used)
          if (!safe(probe) || probe.pageCount !== 1 || !Number.isFinite(used) || used > Math.floor(probe.width * 273 / 186) + .001) stableGroup = false
        }
        if (!stableGroup) break
        if (end === start) continue
        const tail = best[end + 1]
        const option = { pages: 1 + tail.pages, widthCost: width * (end - start + 1) + tail.widthCost,
          groups: [{ start, end: end + 1, width, pageCount: 1 }, ...tail.groups] }
        const current = best[start]
        if (option.pages < current.pages || option.pages === current.pages && (option.widthCost < current.widthCost
          || option.widthCost === current.widthCost && option.groups[0].end > current.groups[0].end)) best[start] = option
      }
    }
  }
  return best[0].groups
}
