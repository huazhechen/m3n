export type ScorePageRange = { first: number; end: number }

/** Keep the minimum page count and move the fewest trailing systems needed
 * to avoid an isolated final system. Actual geometry decides feasibility;
 * headers and other non-music blocks never count as systems. */
export function balanceScorePageTail(groups: readonly ScorePageRange[], fits: (first: number, end: number) => boolean,
  musicCount: (first: number, end: number) => number, canBreak: (index: number) => boolean = () => true): ScorePageRange[] {
  const result = groups.map(group => ({ ...group }))
  const last = result.at(-1), prior = result.at(-2)
  if (!last || !prior || musicCount(last.first, last.end) !== 1) return result
  for (let cut = last.first - 1; cut > prior.first; cut--) {
    if (musicCount(prior.first, cut) < 2) break
    if (musicCount(cut, last.end) < 2 || !canBreak(cut)) continue
    if (fits(prior.first, cut) && fits(cut, last.end)) {
      prior.end = cut; last.first = cut
      break
    }
  }
  return result
}
