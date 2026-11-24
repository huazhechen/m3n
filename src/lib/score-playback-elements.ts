export function queryPlaybackElements(paper: HTMLElement | null, xmlId: string, rendition: number, tupletSlot?: number): Element[] {
  if (!paper) return []
  const grouped = [...paper.querySelectorAll(`[data-m3n-id="${xmlId}"]`)]
    .filter(element => tupletSlot === undefined || element.getAttribute('data-m3n-tuplet-slot') === String(tupletSlot))
  if (grouped.length === 0 && tupletSlot !== undefined) return []
  if (grouped.length === 0) return [paper.querySelector(`#${xmlId}`)].filter(Boolean) as Element[]
  const hasPasses = grouped.some((element) => element.getAttribute('data-m3n-passes') !== null)
  if (hasPasses) {
    // Numbered notation marks every lyric with the playback passes its
    // measure participates in. Exact pass matches win; when no row belongs
    // to this pass, cycle the visible rows for
    // repeated occurrences such as `L3: {L1}`.
    const matching = grouped.filter((element) => {
      const passes = element.getAttribute('data-m3n-passes')
      if (passes === null) return true
      return passes.split('-').map(Number).filter(Number.isInteger).includes(rendition)
    })
    if (matching.some((element) => element.getAttribute('data-m3n-passes') !== null)) return matching
    const visibleRows = [...new Set(grouped
      .filter((element) => (element.textContent ?? '').replaceAll('\u200B', '').trim() !== '')
      .map((element) => Number(element.getAttribute('data-m3n-rendition')))
      .filter(Number.isInteger))]
      .sort((left, right) => left - right)
    if (visibleRows.length > 0) {
      const selected = visibleRows[(Math.max(1, rendition) - 1) % visibleRows.length]
      return grouped.filter((element) => {
        const passes = element.getAttribute('data-m3n-passes')
        if (passes === null) return true
        return Number(element.getAttribute('data-m3n-rendition')) === selected
      })
    }
  }
  const lyricRenditions = [...new Set(grouped
    .map((element) => Number(element.getAttribute('data-m3n-rendition')))
    .filter(Number.isInteger))]
    .sort((left, right) => left - right)
  if (lyricRenditions.length === 0) return grouped
  const hasExactLyricRendition = lyricRenditions.includes(rendition)
  return grouped.filter((element) => {
    const lyricRendition = element.getAttribute('data-m3n-rendition')
    // The `rendN` suffix identifies the playback occurrence, not an index into every
    // lyric row visible in the document. Match it directly whenever possible;
    // when a repeated occurrence has no dedicated row, keep its available
    // lyrics visible rather than silently dropping the highlight.
    return lyricRendition === null || !hasExactLyricRendition || Number(lyricRendition) === rendition
  })
}

