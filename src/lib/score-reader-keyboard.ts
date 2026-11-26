/** Reader shortcuts leave form controls, overlays and zoomed score panning alone. */
export function attachScoreKeyboard(root: HTMLElement, navigate: (direction: 'previous' | 'next') => void) {
  const doc = root.ownerDocument
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
      || !['ArrowLeft', 'ArrowRight'].includes(event.key) || doc.querySelector('dialog[open], :popover-open')) return
    const target = event.target instanceof Element ? event.target : null
    if (target && (target.closest('a, button, input, select, textarea, [role="slider"], [role="textbox"], [contenteditable]')
      || !root.contains(target) && target !== doc.body && target !== doc.documentElement)) return
    const paper = root.querySelector<HTMLElement>('.score-paper')
    if ((window.visualViewport?.scale ?? 1) > 1 || paper && (paper.dataset.zoomed === 'true' || paper.scrollWidth > paper.clientWidth + 1)) return
    event.preventDefault()
    navigate(event.key === 'ArrowLeft' ? 'previous' : 'next')
  }
  doc.addEventListener('keydown', keydown)
  return () => doc.removeEventListener('keydown', keydown)
}
