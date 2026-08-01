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

type LyricPosition = { event: SVGGElement; measure: SVGGElement; bounds: DOMRect; x: number; lineHeight: number }

function lyricPositions(system: SVGGElement) {
  const positions: LyricPosition[] = []
  for (const verse of system.querySelectorAll<SVGGElement>('g.verse')) {
    const measure = verse.closest<SVGGElement>('g.measure')
    const event = verse.closest<SVGGElement>('g.note, g.chord')
    if (!measure || !event) continue
    const bounds = verse.getBBox()
    if (bounds.width === 0 || bounds.height === 0) continue
    positions.push({ event, measure, bounds, x: bounds.x, lineHeight: bounds.height })
  }
  return positions
}

function moveMeasureContentFrom(event: SVGGElement, measure: SVGGElement, amount: number) {
  const layer = event.closest('g.layer') as SVGGElement | null
  if (!layer || !measure.contains(layer)) return false
  let item: SVGElement = event
  while (item.parentNode !== layer) {
    const parent = item.parentNode
    if (!(parent instanceof SVGElement)) return false
    item = parent
  }
  const items = [...layer.children].filter((child): child is SVGElement => child instanceof SVGElement)
  const itemIndex = items.indexOf(item)
  if (itemIndex < 0) return false

  for (const following of items.slice(itemIndex)) appendTranslation(following, amount, 0)
  const eventX = event.querySelector<SVGGraphicsElement>('.notehead, .chordNote')?.getBBox().x ?? event.getBBox().x
  for (const control of measure.querySelectorAll<SVGGElement>(':scope > :not(g.staff)')) {
    if (control.getBBox().x >= eventX - 1) appendTranslation(control, amount, 0)
  }
  return true
}

/**
 * Expand the affected lyric column and measure when Verovio leaves adjacent
 * syllables overlapping, including at measure boundaries.
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
        const gap = Math.max(previous.lineHeight, current.lineHeight) * 0.1
        const amount = previous.x + previous.bounds.width + gap - current.x
        if (amount <= 0) continue

        const previousIndex = measures.indexOf(previous.measure)
        const currentIndex = measures.indexOf(current.measure)
        if (previousIndex < 0 || currentIndex < previousIndex) continue
        const inSameMeasure = previous.measure === current.measure
        if (inSameMeasure && !moveMeasureContentFrom(current.event, current.measure, amount)) continue

        extendStaffLines(previous.measure, amount)
        moveEndingBarlines(previous.measure, amount)
        for (let measureIndex = previousIndex + 1; measureIndex < measures.length; measureIndex += 1) {
          appendTranslation(measures[measureIndex]!, amount, 0)
        }
        for (const position of positions) {
          const positionMeasureIndex = measures.indexOf(position.measure)
          if (positionMeasureIndex > previousIndex || (inSameMeasure && positionMeasureIndex === previousIndex && position.x >= current.x)) {
            position.x += amount
          }
        }
      }
    }
  }
}
