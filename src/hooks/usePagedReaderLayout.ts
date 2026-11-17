import { useEffect, type RefObject } from 'react'
import { MOBILE_LAYOUT_QUERY } from '../lib/responsive-layout'

/** Fit printed pages into the desktop reader's remaining viewport without re-engraving. */
export function usePagedReaderLayout(paperRef: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const paper = paperRef.current
    if (!paper || !enabled) return
    const mobile = window.matchMedia(MOBILE_LAYOUT_QUERY)
    let frame = 0
    const clear = () => {
      delete paper.dataset.viewportPaged
      paper.style.removeProperty('--reader-page-width')
    }
    const update = () => {
      frame = 0
      if (mobile.matches) { clear(); return }
      const pages = [...paper.querySelectorAll<SVGSVGElement>(':scope > .score-page-sheet > svg')]
      if (!pages.length) { clear(); return }
      // Fit the complete A4 sheet, including its 12mm paper margins.
      const aspect = 297 / 210
      if (!Number.isFinite(aspect) || aspect <= 0) return
      let bottomSpace = 0
      for (let ancestor = paper.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor)
        bottomSpace += parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth)
        if (ancestor.tagName === 'MAIN') break
      }
      const style = getComputedStyle(paper)
      const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      const top = paper.getBoundingClientRect().top + window.scrollY
      const height = Math.max(1, window.innerHeight - top - bottomSpace - verticalPadding - 1)
      const width = Math.max(1, Math.min(paper.clientWidth - horizontalPadding, height / aspect))
      paper.dataset.viewportPaged = 'true'
      paper.style.setProperty('--reader-page-width', `${Math.floor(width * 100) / 100}px`)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    const resize = new ResizeObserver(schedule)
    if (paper.parentElement) resize.observe(paper.parentElement)
    const main = paper.closest('main')
    if (main) resize.observe(main)
    const mutation = new MutationObserver(schedule)
    mutation.observe(paper, { childList: true })
    window.addEventListener('resize', schedule)
    mobile.addEventListener('change', schedule)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutation.disconnect()
      window.removeEventListener('resize', schedule)
      mobile.removeEventListener('change', schedule)
      clear()
    }
  }, [paperRef, enabled])
}
