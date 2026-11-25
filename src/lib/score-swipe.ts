/** Touch navigation for the reader; native scrolling and score zoom take priority. */
export function attachScoreSwipe(root: HTMLElement, navigate: (direction: 'previous' | 'next') => void) {
  let gesture: { id: number; x: number; y: number; started: number; horizontal: boolean } | undefined
  let suppressClickUntil = 0
  const cancel = () => { gesture = undefined }
  const start = (event: TouchEvent) => {
    cancel()
    if (event.touches.length !== 1) return
    suppressClickUntil = 0
    const touch = event.touches[0]
    const target = event.target instanceof Element ? event.target : null
    if (!target || touch.clientX < 28 || touch.clientX > window.innerWidth - 28
      || (window.visualViewport?.scale ?? 1) > 1
      || document.querySelector('dialog[open], :popover-open')
      || target.closest('a, button, input, select, textarea, [role="slider"], [contenteditable], dialog, [popover]')) return
    for (let node: Element | null = target; node && root.contains(node); node = node.parentElement) {
      if (node.getAttribute('data-zoomed') === 'true' || node.scrollWidth > node.clientWidth + 1) return
      if (node === root) break
    }
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, started: performance.now(), horizontal: false }
  }
  const move = (event: TouchEvent) => {
    if (!gesture || event.touches.length !== 1) { cancel(); return }
    const touch = event.touches[0]
    if (touch.identifier !== gesture.id) { cancel(); return }
    const dx = Math.abs(touch.clientX - gesture.x)
    const dy = Math.abs(touch.clientY - gesture.y)
    if (!gesture.horizontal) {
      if (Math.max(dx, dy) < 10) return
      if (dx < dy * 1.8) { cancel(); return }
      gesture.horizontal = true
    }
    // Claim only horizontal gestures, before the browser starts native panning.
    if (event.cancelable) event.preventDefault()
    suppressClickUntil = performance.now() + 600
  }
  const end = (event: TouchEvent) => {
    const pending = gesture
    cancel()
    if (!pending || event.touches.length) return
    const touch = Array.from(event.changedTouches).find(touch => touch.identifier === pending.id)
    if (!touch) return
    const dx = touch.clientX - pending.x
    const dy = Math.abs(touch.clientY - pending.y)
    if (!pending.horizontal || Math.abs(dx) < 72 || Math.abs(dx) < dy * 1.8 || performance.now() - pending.started > 800) return
    if (event.cancelable) event.preventDefault()
    suppressClickUntil = performance.now() + 600
    navigate(dx < 0 ? 'next' : 'previous')
  }
  const click = (event: MouseEvent) => {
    if (performance.now() >= suppressClickUntil) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  root.addEventListener('touchstart', start, { passive: true, capture: true })
  root.addEventListener('touchmove', move, { passive: false, capture: true })
  root.addEventListener('touchend', end, { passive: false, capture: true })
  root.addEventListener('touchcancel', cancel, true)
  root.addEventListener('click', click, true)
  return () => {
    root.removeEventListener('touchstart', start, true)
    root.removeEventListener('touchmove', move, true)
    root.removeEventListener('touchend', end, true)
    root.removeEventListener('touchcancel', cancel, true)
    root.removeEventListener('click', click, true)
  }
}
