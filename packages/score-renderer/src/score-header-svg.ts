import type { ScoreHeaderMetadata } from '@m3n/notation'

function escapeXml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character] ?? character)
}

function number(value: number) {
  return Number(value.toFixed(2))
}

export function headerMarkup(metadata: readonly ScoreHeaderMetadata[], width: number) {
  const centered = metadata.filter((item) => item.side === 'center').sort((left, right) => left.priority - right.priority)
  const left = metadata.filter((item) => item.side === 'left').sort((left, right) => left.priority - right.priority)
  const right = metadata.filter((item) => item.side === 'right').sort((left, right) => left.priority - right.priority)
  const lines: string[] = []
  let y = 28

  for (const item of centered) {
    const title = item.priority === 0
    const fontSize = title ? 32 : 16
    const lineHeight = title ? 43.2 : 23.76
    if (!title) y += 8
    lines.push(`<text x="${number(width / 2)}" y="${number(y + fontSize)}" text-anchor="middle" fill="${title ? '#20242b' : '#59616d'}" font-family="ui-serif, serif" font-size="${fontSize}" font-weight="${title ? '700' : '400'}">${escapeXml(item.value)}</text>`)
    y += lineHeight
  }

  const detailCount = Math.max(left.length, right.length)
  if (detailCount > 0) {
    y += 12
    for (let index = 0; index < detailCount; index += 1) {
      const baseline = y + 14
      const leftValue = left[index]?.value
      const rightValue = right[index]?.value
      if (leftValue) lines.push(`<text x="28" y="${number(baseline)}" fill="#30363e" font-family="system-ui, sans-serif" font-size="14">${escapeXml(leftValue)}</text>`)
      if (rightValue) lines.push(`<text x="${number(width - 28)}" y="${number(baseline)}" text-anchor="end" fill="#30363e" font-family="system-ui, sans-serif" font-size="14">${escapeXml(rightValue)}</text>`)
      y += 20.8 + (index < detailCount - 1 ? 6 : 0)
    }
  }

  return { markup: `<g class="m3n-score-header">${lines.join('')}</g>`, height: number(y + 8) }
}

export function scoreHeaderHeight(metadata: readonly ScoreHeaderMetadata[]) {
  return metadata.length === 0 ? 0 : headerMarkup(metadata, 0).height
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
