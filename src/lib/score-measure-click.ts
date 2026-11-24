/** Resolve every click in a measure to its first event, across row/page fragments. */
export function measureClickTarget(paper: HTMLElement, target: Element) {
  const clicked = target.closest('g.measure')
  if (!clicked || !paper.contains(clicked)) return null
  const measureId = (measure: Element) => measure.getAttribute('data-m3n-measure-id')
    ?? measure.id.replace(/(?:-s\d+|-fragment-\d+)$/, '')
  const id = measureId(clicked)
  const first = [...paper.querySelectorAll('g.measure')].find(measure => measureId(measure) === id)
  const event = first?.querySelector('[data-m3n-id^="m3n-e-"], [id^="m3n-e-"]')
  const rawId = event?.getAttribute('data-m3n-id') ?? event?.id
  if (!rawId) return null
  const playbackId = rawId.replace(/-v\d+$/, '').replace(/-n\d+$/, '')
  return { playbackId, xmlId: playbackId.replace(/-rend\d+$/, '') }
}

/** Keep the boundary note-on pending despite MIDI clock accumulation error. */
export function measureSeekProgress(milliseconds: number, duration: number) {
  return Math.max(0, milliseconds - 1) / (duration * 1000)
}
