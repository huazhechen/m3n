/** Minimum vertical movement needed to reveal a row; tall rows align at the top. */
export function playbackScrollDelta(top: number, bottom: number, visibleTop: number, visibleBottom: number) {
  if (top < visibleTop) return top - visibleTop
  if (bottom > visibleBottom && bottom - top <= visibleBottom - visibleTop) return bottom - visibleBottom
  if (bottom > visibleBottom && top > visibleTop) return top - visibleTop
  return 0
}

/** Reader playback follows engraved row bounds without moving focus or editor selections. */
export function followPlayingMeasure(measure: SVGGElement) {
  const target = measure.querySelector('.measure-playback-highlight') ?? measure
  const bounds = target.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return
  let top = 12
  let bottom = window.innerHeight - 12
  for (const overlay of document.querySelectorAll<HTMLElement>('.top-nav, .floating-controls .control-transport, .immersion-toggle')) {
    if (getComputedStyle(overlay).visibility === 'hidden' || !overlay.getClientRects().length) continue
    const rect = overlay.getBoundingClientRect()
    if (rect.right <= bounds.left || rect.left >= bounds.right) continue
    if (overlay.matches('.top-nav')) top = Math.max(top, rect.bottom + 12)
    else bottom = Math.min(bottom, rect.top - 12)
  }
  // Zoomed paper can scroll independently of the page.
  for (let parent = measure.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) {
      const rect = parent.getBoundingClientRect()
      const delta = playbackScrollDelta(bounds.top, bounds.bottom, Math.max(top, rect.top + 12), Math.min(bottom, rect.bottom - 12))
      if (delta) parent.scrollBy({ top: delta, behavior: 'instant' })
      return
    }
  }
  const delta = playbackScrollDelta(bounds.top, bounds.bottom, top, bottom)
  if (delta) window.scrollBy({ top: delta, behavior: 'instant' })
}
