function translateVertically(element: SVGElement, offset: number) { 
  if (offset <= 0) return
  const transform = element.getAttribute('transform')
  element.setAttribute('transform', `${transform ? `${transform} ` : ''}translate(0 ${offset})`)
}

function lyricLineHeight(verse: SVGGElement, bounds: DOMRect) {
  const lineHeights = [...verse.querySelectorAll<SVGGraphicsElement>('text')]
    .map((text) => text.getBBox().height)
    .filter((height) => height > 0)
  return lineHeights.length > 0 ? Math.max(...lineHeights) : bounds.height
}

type PositionedLyric = { verse: SVGGElement; bounds: DOMRect; lineHeight: number; lineOffset: number }

function addLyricLineSpacing(lyrics: PositionedLyric[]) {
  const rows = new Map<number, PositionedLyric[]>()
  for (const lyric of lyrics) {
    const row = Math.round(lyric.bounds.y)
    const existing = rows.get(row)
    if (existing) existing.push(lyric)
    else rows.set(row, [lyric])
  }

  let previousBottom = -Infinity
  let previousLineHeight = 0
  for (const row of [...rows.values()].sort((left, right) => (left[0]?.bounds.y ?? 0) - (right[0]?.bounds.y ?? 0))) {
    const top = Math.min(...row.map((lyric) => lyric.bounds.y))
    const offset = Math.max(0, previousBottom + previousLineHeight * 0.1 - top)
    row.forEach((lyric) => { lyric.lineOffset = offset })
    previousBottom = Math.max(...row.map((lyric) => lyric.bounds.y + lyric.bounds.height + offset))
    previousLineHeight = Math.max(...row.map((lyric) => lyric.lineHeight))
  }
}

/** Expands lyric rows and following systems when Verovio's initial layout overlaps them. */
export function resolveLyricCollisions(paper: HTMLElement) {
  for (const page of paper.querySelectorAll<SVGSVGElement>(':scope > svg:not([data-m3n-lyric-adjusted])')) {
    const engraving = page.querySelector<SVGSVGElement>(':scope > svg.definition-scale')
    if (!engraving) continue
    const systems = [...engraving.querySelectorAll<SVGGElement>(':scope > g.page-margin > g.system')]
    let downstreamOffset = 0
    let occupiedLyricBottom = -Infinity

    for (const system of systems) {
      // `getBBox()` is expressed in the system's local coordinate space and
      // therefore ignores earlier transform offsets. Apply the accumulated
      // lyric clearance before placing each successive system.
      downstreamOffset = Math.max(downstreamOffset, occupiedLyricBottom - system.getBBox().y)
      translateVertically(system, downstreamOffset)
      const verses = [...system.querySelectorAll<SVGGElement>('g.verse')]
      const obstacles = [...system.querySelectorAll<SVGGraphicsElement>('.notehead, .stem path, .flag path, .beam path, .beam polygon, .slur path, path.slur, .staff > path')]
      const lyrics = verses.map((verse) => {
        const bounds = verse.getBBox()
        return { verse, bounds, lineHeight: lyricLineHeight(verse, bounds), lineOffset: 0 }
      })
      addLyricLineSpacing(lyrics)
      let lyricOffset = 0

      for (const lyric of lyrics) {
        for (const obstacle of obstacles) {
          const bounds = obstacle.getBBox()
          const lyricTop = lyric.bounds.y + lyric.lineOffset
          const overlapsHorizontally = lyric.bounds.x < bounds.x + bounds.width && lyric.bounds.x + lyric.bounds.width > bounds.x
          const requiredLyricTop = bounds.y + bounds.height + lyric.lineHeight * 0.4
          if (overlapsHorizontally && bounds.y < lyricTop && lyricTop < requiredLyricTop) {
            lyricOffset = Math.max(lyricOffset, requiredLyricTop - lyricTop)
          }
        }
      }

      lyrics.forEach((lyric) => translateVertically(lyric.verse, lyric.lineOffset + lyricOffset))
      if (lyrics.length === 0) continue
      const lyricBottom = Math.max(...lyrics.map((lyric) => lyric.bounds.y + lyric.bounds.height + lyric.lineOffset + lyricOffset + lyric.lineHeight * 0.2))
      occupiedLyricBottom = Math.max(occupiedLyricBottom, lyricBottom + downstreamOffset)
    }

    if (downstreamOffset > 0) {
      const pageViewBox = page.viewBox.baseVal
      const engravingViewBox = engraving.viewBox.baseVal
      const engravingScale = engravingViewBox.height > 0 ? pageViewBox.height / engravingViewBox.height : 1
      const pixelScale = pageViewBox.width > 0 ? page.getBoundingClientRect().width / pageViewBox.width : 1
      const extraHeight = downstreamOffset * engravingScale * pixelScale
      page.setAttribute('preserveAspectRatio', 'xMinYMin meet')
      page.style.height = `${page.getBoundingClientRect().height + extraHeight}px`
      engraving.setAttribute('overflow', 'visible')
    }
    page.dataset.m3nLyricAdjusted = 'true'
  }
}
