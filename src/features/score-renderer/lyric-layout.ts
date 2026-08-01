function appendTranslation(element: SVGElement, x: number, y: number) {
  if (x === 0 && y === 0) return
  const transform = element.getAttribute('transform')
  element.setAttribute('transform', `${transform ? `${transform} ` : ''}translate(${x} ${y})`)
}

function extendStaffLines(measure: SVGGElement, amount: number) {
  for (const line of measure.querySelectorAll<SVGPathElement>(':scope > g.staff > path')) {
    const match = /^M\s*([-\d.]+)\s+([-\d.]+)\s+L\s*([-\d.]+)\s+([-\d.]+)$/.exec(line.getAttribute('d') ?? '')
    if (!match) continue
    line.setAttribute('d', `M${match[1]} ${match[2]} L${Number(match[3]) + amount} ${match[4]}`)
  }
}

function moveEndingBarlines(measure: SVGGElement, amount: number) {
  const barlines = [...measure.querySelectorAll<SVGGElement>('.barLine')]
  if (barlines.length === 0) return
  const rightmost = Math.max(...barlines.map((barline) => barline.getBBox().x))
  for (const barline of barlines) {
    if (barline.getBBox().x >= rightmost - 1) appendTranslation(barline, amount, 0)
  }
}

type LyricPosition = { measure: SVGGElement; bounds: DOMRect; x: number; lineHeight: number }

function lyricPositions(system: SVGGElement) {
  const positions: LyricPosition[] = []
  for (const verse of system.querySelectorAll<SVGGElement>('g.verse')) {
    const measure = verse.closest<SVGGElement>('g.measure')
    if (!measure) continue
    const bounds = verse.getBBox()
    if (bounds.width === 0 || bounds.height === 0) continue
    positions.push({ measure, bounds, x: bounds.x, lineHeight: bounds.height })
  }
  return positions
}

/**
 * Verovio reserves lyric width within a measure but not across an adjacent
 * measure boundary. Expand only the preceding measure when such lyrics meet.
 */
export function expandMeasuresForLyricCollisions(root: ParentNode) {
  for (const system of root.querySelectorAll<SVGGElement>('g.system')) {
    const measures = [...system.querySelectorAll<SVGGElement>(':scope > g.measure')]
    if (measures.length < 2) continue

    const positions = lyricPositions(system)
    const rows = new Map<number, LyricPosition[]>()
    for (const position of positions) {
      const row = Math.round(position.bounds.y)
      const values = rows.get(row)
      if (values) values.push(position)
      else rows.set(row, [position])
    }

    for (const row of rows.values()) {
      row.sort((left, right) => left.x - right.x)
      for (let index = 1; index < row.length; index += 1) {
        const previous = row[index - 1]!
        const current = row[index]!
        if (previous.measure === current.measure) continue
        const gap = Math.max(previous.lineHeight, current.lineHeight) * 0.1
        const amount = previous.x + previous.bounds.width + gap - current.x
        if (amount <= 0) continue

        const previousIndex = measures.indexOf(previous.measure)
        const currentIndex = measures.indexOf(current.measure)
        if (previousIndex < 0 || currentIndex <= previousIndex) continue

        extendStaffLines(previous.measure, amount)
        moveEndingBarlines(previous.measure, amount)
        for (let measureIndex = previousIndex + 1; measureIndex < measures.length; measureIndex += 1) {
          appendTranslation(measures[measureIndex]!, amount, 0)
        }
        for (const position of positions) {
          if (measures.indexOf(position.measure) > previousIndex) position.x += amount
        }
      }
    }
  }
}
