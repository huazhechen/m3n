/** Scale the displayed score without changing engraving or export settings. */
export function attachScoreZoom(paper: HTMLElement) {
  let scale = 1
  let pinch: { distance: number; scale: number } | undefined
  let suppressClick = false
  const zoom = (next: number, x: number, y: number) => {
    next = Math.max(0.5, Math.min(4, next))
    if (!Number.isFinite(next) || next === scale) return
    const target = document.elementFromPoint(x, y)?.closest('.score-page-sheet, .score-paper > svg')
    const anchor = target && paper.contains(target) ? target : paper.firstElementChild
    const before = anchor?.getBoundingClientRect()
    const fractionX = before?.width ? (x - before.left) / before.width : 0
    const fractionY = before?.height ? (y - before.top) / before.height : 0
    scale = next
    paper.style.setProperty('--score-zoom', String(scale))
    paper.dataset.zoomed = String(scale !== 1)
    const after = anchor?.getBoundingClientRect()
    if (before && after) {
      paper.scrollLeft += after.left + fractionX * after.width - x
      window.scrollBy({ top: after.top + fractionY * after.height - y, behavior: 'instant' })
    }
  }
  const wheel = (event: WheelEvent) => {
    if (!event.deltaY || !paper.firstElementChild) return
    event.preventDefault()
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? paper.clientHeight : 1)
    zoom(scale * Math.exp(-Math.max(-200, Math.min(200, pixels)) * 0.002), event.clientX, event.clientY)
  }
  const pair = (event: TouchEvent) => {
    const [a, b] = event.touches
    return {
      distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
    }
  }
  const touchStart = (event: TouchEvent) => {
    if (event.touches.length !== 2) { pinch = undefined; return }
    event.preventDefault()
    const { distance } = pair(event)
    pinch = { distance, scale }
    suppressClick = true
  }
  const touchMove = (event: TouchEvent) => {
    if (!pinch || event.touches.length !== 2) return
    event.preventDefault()
    const { distance, x, y } = pair(event)
    if (pinch.distance > 0) zoom(pinch.scale * distance / pinch.distance, x, y)
  }
  const touchEnd = (event: TouchEvent) => {
    if (event.touches.length !== 2) pinch = undefined
  }
  const click = (event: MouseEvent) => {
    if (!suppressClick) return
    suppressClick = false
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  // A new single touch or mouse press is an intentional note selection.
  const pointerDown = () => { if (!pinch) suppressClick = false }
  paper.addEventListener('wheel', wheel, { passive: false })
  paper.addEventListener('touchstart', touchStart, { passive: false })
  paper.addEventListener('touchmove', touchMove, { passive: false })
  paper.addEventListener('touchend', touchEnd)
  paper.addEventListener('touchcancel', touchEnd)
  paper.addEventListener('click', click, true)
  paper.addEventListener('pointerdown', pointerDown)
  return () => {
    paper.removeEventListener('wheel', wheel)
    paper.removeEventListener('touchstart', touchStart)
    paper.removeEventListener('touchmove', touchMove)
    paper.removeEventListener('touchend', touchEnd)
    paper.removeEventListener('touchcancel', touchEnd)
    paper.removeEventListener('click', click, true)
    paper.removeEventListener('pointerdown', pointerDown)
    paper.style.removeProperty('--score-zoom')
    delete paper.dataset.zoomed
  }
}
