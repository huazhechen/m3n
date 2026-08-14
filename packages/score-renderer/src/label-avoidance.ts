const STAFF_CLEARANCE = 500
const OBSTACLE_GAP = 80

function systemStaffTop(system: SVGGElement) {
  const bar = system.querySelector<SVGPathElement>('path')?.getAttribute('d') ?? ''
  const match = /M[\d.]+ ([\d.]+) L[\d.]+ ([\d.]+)/.exec(bar)
  return match ? Math.min(Number(match[1]), Number(match[2])) : undefined
}

/**
 * Shifts section labels (reh) and text directions (dir) so they stay clear
 * of the staff and of measure numbers or notes they would cover.
 */
export function avoidLabelCollisions(paper: HTMLElement) {
  paper.querySelectorAll<SVGGElement>('g.reh, g.dir').forEach((label) => {
    const text = label.querySelector<SVGTextElement>(':scope > text')
    if (!text) return
    const box = text.getBBox()
    if (box.width <= 0 || box.height <= 0) return
    const system = label.closest<SVGGElement>('g.system')
    let deltaY = 0
    let deltaX = 0

    const staffTop = system ? systemStaffTop(system) : undefined
    if (staffTop !== undefined && box.y + box.height > staffTop - STAFF_CLEARANCE) {
      deltaY = (staffTop - STAFF_CLEARANCE) - (box.y + box.height)
    }

    const obstacles = system
      ? [...system.querySelectorAll<SVGGElement>('g.mNum, g.note, g.chord')]
      : []
    for (const obstacle of obstacles) {
      const obstacleBox = obstacle.getBBox()
      if (obstacleBox.width <= 0 || obstacleBox.height <= 0) continue
      const shiftedBox = { x: box.x, y: box.y + deltaY, width: box.width, height: box.height }
      const horizontallyOverlaps = shiftedBox.x < obstacleBox.x + obstacleBox.width
        && obstacleBox.x < shiftedBox.x + shiftedBox.width
      const verticallyOverlaps = shiftedBox.y < obstacleBox.y + obstacleBox.height
        && obstacleBox.y < shiftedBox.y + shiftedBox.height
      if (horizontallyOverlaps && verticallyOverlaps) {
        deltaX = Math.max(deltaX, obstacleBox.x + obstacleBox.width - shiftedBox.x + OBSTACLE_GAP)
      }
    }

    if (deltaY !== 0) {
      text.setAttribute('y', String(Number(text.getAttribute('y') ?? 0) + deltaY))
    }
    if (deltaX > 0) {
      text.setAttribute('x', String(Number(text.getAttribute('x') ?? 0) + deltaX))
    }
  })
}
