/** Compare generated rests by their measure, ordinal and printed count.
 * Incidental engine serials are not musical identity; every digit and its
 * original measured coordinates still participate in comparison. */
export function captureNumberedGeometry(root) {
  const restIds = new Map(), counts = new Map()
  const isDigit = node => node.getAttribute('font-size') === '22' && (node.closest('g.note')?.id.startsWith('m3n-rest-') ? /^\d+$/.test(node.textContent) : /^[0-7]$/.test(node.textContent))
  for (const group of root.querySelectorAll('g.note[id^="m3n-rest-"]')) {
    const measure = group.getAttribute('data-m3n-measure')
    if (!measure) throw new Error('Multi-measure rest has no measure identity')
    const ordinal = counts.get(measure) ?? 0
    counts.set(measure, ordinal + 1)
    const number = [...group.querySelectorAll('text')].filter(isDigit).map(node => node.textContent).join(',')
    restIds.set(group, `${measure}-rest-${ordinal}-${number}`)
  }
  const pages = [...root.querySelectorAll('svg')]
  const systems = [...root.querySelectorAll('g.system')].map(system => {
    const digits = [...system.querySelectorAll('g.note text')].filter(isDigit)
    const notes = digits.map(node => {
      const box = node.getBBox(), p = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(node.getCTM())
      const group = node.closest('.note')
      const head = [...group.querySelectorAll('text')].filter(isDigit).indexOf(node)
      return { id: restIds.get(group) ?? group.id, head, digit: node.textContent, x: p.x, y: p.y }
    })
    const melody = notes.filter(note => !note.id.includes('bass'))
    return { ids: notes.map(note => `${note.id}:${note.head}`).sort(), notes, axis: melody[0]?.y ?? 0,
      measures: [...new Set([...system.querySelectorAll('g.note')].map(node => node.getAttribute('data-m3n-measure')))] }
  })
  return { pageCount: pages.length, height: pages.reduce((sum, svg) => sum + svg.viewBox.baseVal.height, 0),
    systems, lineGaps: systems.slice(1).map((system, i) => system.axis - systems[i].axis) }
}
