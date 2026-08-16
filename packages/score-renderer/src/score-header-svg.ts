import { scoreHeaderLayout, type ScoreHeaderMetadata } from '@m3n/notation'

function escapeXml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character] ?? character)
}

function number(value: number) {
  return Number(value.toFixed(2))
}

export function headerMarkup(metadata: readonly ScoreHeaderMetadata[], width: number) {
  const layout = scoreHeaderLayout(metadata, width)
  const lines = layout.lines.map((line) => (
    `<text x="${number(line.x)}" y="${number(line.y)}"${line.anchor === undefined ? '' : ` text-anchor="${line.anchor}"`} fill="${line.fill}" font-family="${line.font}" font-size="${line.size}" font-weight="${line.bold ? '700' : '400'}">${escapeXml(line.value)}</text>`
  ))
  return { markup: `<g class="m3n-score-header">${lines.join('')}</g>`, height: layout.height }
}

export function scoreHeaderHeight(metadata: readonly ScoreHeaderMetadata[]) {
  return scoreHeaderLayout(metadata, 0).height
}

/** Applies a score header to any SVG with a numeric viewBox. */
export function addScoreHeaderToSvg(svg: SVGSVGElement, metadata: readonly ScoreHeaderMetadata[], width: number, height: number) {
  if (metadata.length === 0 || svg.hasAttribute('data-m3n-header')) return height
  const { markup, height: headerHeight } = headerMarkup(metadata, width)
  const content = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  while (svg.firstChild) content.append(svg.firstChild)
  content.setAttribute('transform', `translate(0, ${headerHeight})`)
  svg.append(content)
  svg.insertAdjacentHTML('afterbegin', markup)
  svg.setAttribute('viewBox', `0 0 ${number(width)} ${number(height + headerHeight)}`)
  svg.setAttribute('data-m3n-header', 'true')
  return height + headerHeight
}

/** Adds the existing score header layout to the first Verovio SVG page. */
export function withScoreHeader(svg: string, metadata: readonly ScoreHeaderMetadata[]) {
  if (metadata.length === 0) return svg
  const outer = /<svg\b(?=[^>]*\bviewBox="0 0 ([\d.]+) ([\d.]+)")[^>]*>/.exec(svg)
  const definitionScale = /<svg\b(?=[^>]*\bclass="definition-scale")[^>]*>/.exec(svg)
  if (!outer || !definitionScale) return svg
  const width = Number(outer[1])
  const scoreHeight = Number(outer[2])
  if (!Number.isFinite(width) || !Number.isFinite(scoreHeight)) return svg

  const { markup, height } = headerMarkup(metadata, width)
  const expandedOuter = outer[0].replace(`viewBox="0 0 ${outer[1]} ${outer[2]}"`, `viewBox="0 0 ${outer[1]} ${number(scoreHeight + height)}"`)
  const positionedScore = definitionScale[0]
    .replace(/\s(?:x|y|width|height)="[^"]*"/g, '')
    .replace(/>$/, ` x="0" y="${height}" width="${width}" height="${scoreHeight}">`)

  return svg.replace(outer[0], expandedOuter).replace(definitionScale[0], `${markup}${positionedScore}`)
}

export function addScoreHeaderToPaper(paper: HTMLElement, metadata: readonly ScoreHeaderMetadata[]) {
  const firstPage = paper.querySelector<SVGSVGElement>(':scope > svg:not([data-m3n-header])')
  if (!firstPage) return
  firstPage.outerHTML = withScoreHeader(firstPage.outerHTML, metadata)
  paper.querySelector<SVGSVGElement>(':scope > svg')?.setAttribute('data-m3n-header', 'true')
}
