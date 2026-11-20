/** Width is the only engraving variable; all candidates use the web defaults. */
export const widthCandidates = Array.from({ length: 19 }, (_, index) => 540 + index * 10)
export const widthSearchStrategy = 'coarse-bisection-local-stability-v1'
const safe = c => !c.error && c.pageCount > 0 && !c.outside.length && !c.overlaps.length
const rank = (a, b) => a.pageCount - b.pageCount || a.width - b.width

export function chooseBestWidth(candidates) {
  // Fixed A4 placement makes a narrower source produce larger music.
  return candidates.filter(c => safe(c) && c.stable !== false).sort(rank)[0] ?? null
}

/** Heuristic search: coarse samples, bracketed bisection, then local ±5px checks.
 * Pagination need not be monotone; this deliberately does not promise an exhaustive
 * global optimum. All returned candidates have actually undergone stability checks.
 * Optional expensive SVG verification runs only on prospective stable candidates.
 */
export async function probeWidthCandidates(measure, { requiredWidths = [], verify } = {}) {
  const cache = new Map(), verified = new Map(), checked = new Map()
  let requests = 0, hits = 0
  const probe = async width => {
    requests++
    if (cache.has(width)) { hits++; return cache.get(width) }
    let result
    try { result = { width, ...await measure(width) } }
    catch (error) { result = { width, error: error.message } }
    cache.set(width, result)
    return result
  }
  const validate = async width => {
    if (checked.has(width)) return checked.get(width)
    let cases = []
    for (const offset of [-5, 0, 5]) cases.push(await probe(width + offset))
    const consistent = values => values.every(c => safe(c) && c.pageCount === values[1].pageCount)
    if (verify && consistent(cases)) {
      const full = []
      for (const c of cases) {
        if (!verified.has(c.width)) {
          let result
          try { result = { ...c, ...await verify(c.width, c) } }
          catch (error) { result = { ...c, error: error.message } }
          verified.set(c.width, result)
        }
        full.push(verified.get(c.width))
      }
      cases = full
    }
    const result = { ...cases[1], stable: consistent(cases), stabilityCases: cases }
    checked.set(width, result)
    return result
  }
  for (const width of requiredWidths) {
    if (!widthCandidates.includes(width)) throw new Error(`Invalid required width: ${width}`)
  }
  const anchors = [...new Set([540, 600, 660, 720, ...requiredWidths])].sort((a, b) => a - b)
  for (const width of anchors) await probe(width)
  const samples = () => [...cache.values()].filter(c => widthCandidates.includes(c.width) && safe(c)).sort(rank)
  const target = samples()[0]?.pageCount
  // Refine every sampled entrance into the best page-count band, not just the
  // endpoints of the entire range. Coarse interior samples catch broad reversals.
  for (let i = 1; i < anchors.length; i++) {
    let low = anchors[i - 1], high = anchors[i]
    if (cache.get(low).pageCount <= target || !safe(cache.get(high)) || cache.get(high).pageCount !== target) continue
    while (high - low > 10) {
      const mid = low + Math.floor((high - low) / 20) * 10
      const result = await probe(mid)
      if (safe(result) && result.pageCount <= target) high = mid
      else low = mid
    }
  }
  // Walk around the prospective winner. Only failed/unstable candidates cause
  // further exploration; a flat score never pays for the entire width grid.
  while (true) {
    const next = samples().find(c => !checked.has(c.width))
    if (!next) break
    const result = await validate(next.width)
    const best = chooseBestWidth([...checked.values()])
    if (result.stable && best === result) {
      const previous = result.width - 10
      if (previous >= 540 && !checked.has(previous)) {
        const neighbor = await probe(previous)
        if (safe(neighbor) && neighbor.pageCount <= result.pageCount) continue
      }
      break
    }
    for (const width of [next.width - 10, next.width + 10]) {
      if (widthCandidates.includes(width)) await probe(width)
    }
  }
  // Packing needs its common width even when it loses the solo-width search.
  for (const width of requiredWidths) await validate(width)
  return { candidates: [...checked.values()].sort((a, b) => a.width - b.width),
    renderCache: { strategy: widthSearchStrategy, requests, uniqueWidths: cache.size, hits, verifiedWidths: verified.size } }
}
