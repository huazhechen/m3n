import { parseM3NDocument } from '@m3n/notation'
import { NumberedNotationScore, prepareNumberedNotationFonts } from '@m3n/numbered-notation'
import { measure } from './scorebook-layout.mjs'
export { prepareNumberedNotationFonts }

/** Trial only: use unchanged web engraving at neighbouring layout widths. */
export async function probe(source, width) {
  const layout = await measure(source, width)
  const svgs = [...document.querySelectorAll('#scratch > svg')]
  const markup = svgs.map(svg => svg.outerHTML)
  const systemsPerPage = svgs.map(svg => svg.querySelectorAll('g.system').length)
  const direct = NumberedNotationScore.create(parseM3NDocument(source)).render({ width, paged: true, pageMargin: 0 })
  const normalized = document.createElement('div')
  normalized.innerHTML = direct.join('')
  return { ...layout, systemsPerPage, identical: JSON.stringify(markup) === JSON.stringify([...normalized.children].map(svg => svg.outerHTML)), markup }
}
