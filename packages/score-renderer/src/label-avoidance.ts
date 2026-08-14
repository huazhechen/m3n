const LABEL_GAP = 80
const PAGE_TOP_MARGIN = 120

function translateOffset(element: SVGElement, offset: number) {
  if (offset === 0) return
  const transform = element.getAttribute('transform')
  element.setAttribute('transform', `${transform ? `${transform} ` : ''}translate(0 ${offset})`)
}

function boxesOverlap(left: DOMRect, right: DOMRect) {
  return left.x < right.x + right.width
    && right.x < left.x + left.width
    && left.y < right.y + right.height
    && right.y < left.y + left.height
}

function systemContentRight(system: SVGGElement) {
  const xs = [...system.querySelectorAll<SVGPathElement>('path')]
    .map((path) => /M([\d.]+) /.exec(path.getAttribute('d') ?? '')?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
  return xs.length > 0 ? Math.max(...xs) : Number.POSITIVE_INFINITY
}

/**
 * Shifts section and text labels out of overlaps. Labels prefer moving right;
 * when the page has no room, the whole system is pushed down instead.
 */
export function avoidLabelCollisions(paper: HTMLElement) {
  for (const page of paper.querySelectorAll<SVGSVGElement>(':scope > svg')) {
    const engraving = page.querySelector<SVGSVGElement>(':scope > svg.definition-scale')
    if (!engraving) continue
    const systems = [...engraving.querySelectorAll<SVGGElement>('g.system')]
    let downstreamOffset = 0

    for (let index = 0; index < systems.length; index += 1) {
      const system = systems[index]
      if (!system) continue
      translateOffset(system, downstreamOffset)
      const labels = [...system.querySelectorAll<SVGGElement>('g.reh, g.dir')]
      const obstacles = [...system.querySelectorAll<SVGGElement>('g.mNum, g.note, g.chord')]
      const systemRight = systemContentRight(system)
      const labelShifts = new Map<SVGGElement, { x: number; y: number }>()
      let systemShift = 0

      for (const label of labels) {
        const text = label.querySelector<SVGTextElement>(':scope > text')
        if (!text) continue
        const box = text.getBBox()
        if (box.width <= 0 || box.height <= 0) continue
        let shiftX = 0
        let shiftY = 0

        if (box.y < PAGE_TOP_MARGIN) shiftY = Math.max(shiftY, PAGE_TOP_MARGIN - box.y)

        for (const obstacle of obstacles) {
          const obstacleBox = obstacle.getBBox()
          if (obstacleBox.width <= 0 || obstacleBox.height <= 0) continue
          if (!boxesOverlap(box, obstacleBox)) continue
          const rightShift = obstacleBox.x + obstacleBox.width - box.x + LABEL_GAP
          if (box.x + box.width + rightShift <= systemRight) {
            shiftX = Math.max(shiftX, rightShift)
          } else {
            systemShift = Math.max(systemShift, box.y + box.height - obstacleBox.y + LABEL_GAP)
          }
        }

        if (shiftX > 0 || shiftY > 0) labelShifts.set(label, { x: shiftX, y: shiftY })
      }

      labelShifts.forEach(({ x, y }, label) => {
        const text = label.querySelector<SVGTextElement>(':scope > text')
        if (!text) return
        if (x > 0) text.setAttribute('x', String(Number(text.getAttribute('x') ?? 0) + x))
        if (y > 0) text.setAttribute('y', String(Number(text.getAttribute('y') ?? 0) + y))
      })

      if (systemShift > 0) {
        translateOffset(system, systemShift)
        labels.forEach((label) => translateOffset(label, -systemShift))
        downstreamOffset += systemShift
      }
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
  }
}
