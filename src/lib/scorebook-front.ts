import { scoreLayoutConfig } from '@m3n/numbered-notation/layout-config'

const style = scoreLayoutConfig.scorebook
const ns = 'http://www.w3.org/2000/svg'
const website = 'https://score.cheesefans.com/'
type Entry = { title: string; section: string; file?: string; slug?: string; musicStart: number; pageCount: number }
type Plan = { title: string; page: { width: number; height: number }; contents: { rowHeightEm: number; pages?: number }; sections: { id: string; title: string }[] }

/** Online and local exports share measured typography, balanced columns and vector leaders. */
export function scorebookFrontPages(plan: Plan, entries: Entry[]) {
  const page = () => {
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('xmlns', ns)
    svg.setAttribute('viewBox', `0 0 ${plan.page.width} ${plan.page.height}`)
    svg.setAttribute('width', String(plan.page.width)); svg.setAttribute('height', String(plan.page.height))
    svg.innerHTML = '<rect width="100%" height="100%" fill="white"/>'
    return svg
  }
  const text = (svg: SVGSVGElement, value: string, x: number, y: number, size: number, url?: string) => {
    const node = document.createElementNS(ns, 'text')
    node.textContent = value
    if (url) node.setAttribute('data-scorebook-url', url)
    for (const [key, value] of Object.entries({ x, y, 'font-size': size, 'font-family': scoreLayoutConfig.fonts.cjk, fill: '#000' })) node.setAttribute(key, String(value))
    if (url) { const link = document.createElementNS(ns, 'a'); link.setAttribute('href', url); link.append(node); svg.append(link) }
    else svg.append(node)
    return node
  }
  type Row = { section: Plan['sections'][number] } | { entry: Entry }
  const rows: Row[] = plan.sections.flatMap(section => [{ section }, ...entries.filter(entry => entry.section === section.id).map(entry => ({ entry }))])
  const pageCount = Math.max(1, plan.contents.pages ?? 1), frontCount = 1 + pageCount
  const columns: Row[][] = []
  let offset = 0
  for (let index = 0; index < pageCount * 2; index++) {
    let count = Math.ceil((rows.length - offset) / (pageCount * 2 - index))
    // A chapter heading always travels with its first song.
    if (count > 0 && 'section' in rows[offset + count - 1]!) count++
    columns.push(rows.slice(offset, offset + count)); offset += count
  }
  const maxRows = Math.max(...columns.map(column => column.length), 2)
  const availableHeight = plan.page.height - style.contentsRowsTop - style.contentsBottomInset
  const rowHeight = availableHeight / (maxRows - 1)
  const label = (entry: Entry) => {
    const first = frontCount + entry.musicStart + 1
    return entry.pageCount === 1 ? String(first) : `${first}–${first + entry.pageCount - 1}`
  }
  const measuring = page()
  measuring.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'
  document.body.append(measuring)
  const probe = text(measuring, '', 0, 0, 1)
  const widths = new Map<string, number>()
  const measure = (value: string) => {
    let width = widths.get(value)
    if (width === undefined) { probe.textContent = value; width = probe.getComputedTextLength(); widths.set(value, width) }
    return width
  }
  let fontSize = Math.min(style.entryTitle * 2, rowHeight / plan.contents.rowHeightEm)
  try {
    for (const row of rows) {
      const units = 'entry' in row ? measure(row.entry.title) + measure(label(row.entry)) + style.contentsLeaderSpaceEm * 2 + style.contentsLeaderMinimumEm : measure(row.section.title)
      fontSize = Math.min(fontSize, style.pageNumberOffset / units)
    }
  } finally { measuring.remove() }
  const cover = page()
  text(cover, plan.title, plan.page.width / 2, style.coverTitleY, style.coverTitle, website).setAttribute('text-anchor', 'middle')
  text(cover, website, plan.page.width / 2, style.coverWebsiteY, style.coverWebsite, website).setAttribute('text-anchor', 'middle')
  const contents = Array.from({ length: pageCount }, (_, index) => {
    const svg = page()
    svg.dataset.scorebookContents = String(index + 1)
    text(svg, '目录', style.contentsLeft, style.contentsTop, style.contentsTitle)
    for (let side = 0; side < 2; side++) {
      const x = style.contentsLeft + side * style.columnStep, right = x + style.pageNumberOffset
      for (const [rowIndex, row] of columns[index * 2 + side]!.entries()) {
        const y = style.contentsRowsTop + rowIndex * rowHeight
        if ('section' in row) { text(svg, row.section.title, x, y, fontSize); continue }
        const entry = row.entry, url = `${website}scores/${encodeURIComponent(entry.slug ?? entry.file?.replace(/\.m3n$/, '') ?? '')}`
        const name = text(svg, entry.title, x, y, fontSize, url)
        const number = text(svg, label(entry), right, y, fontSize, url)
        number.setAttribute('text-anchor', 'end')
        // Measurements above use the same installed CJK font at 1px.
        const start = x + widths.get(entry.title)! * fontSize + fontSize * style.contentsLeaderSpaceEm
        const end = right - widths.get(label(entry))! * fontSize - fontSize * style.contentsLeaderSpaceEm
        // Explicit dash segments survive both native PDF and browser SVG export.
        const leader = document.createElementNS(ns, 'path')
        const dash = fontSize * .1, step = fontSize * .26, baseline = y - fontSize * .25
        const segments: string[] = []
        for (let left = start; left < end; left += step) segments.push(`M${left} ${baseline}H${Math.min(left + dash, end)}`)
        for (const [key, value] of Object.entries({ d: segments.join(' '), fill: 'none', stroke: '#666', 'stroke-width': fontSize * .04 })) leader.setAttribute(key, String(value))
        leader.setAttribute('data-scorebook-leader', '')
        svg.insertBefore(leader, name.parentNode)
      }
    }
    return svg
  })
  return [cover, ...contents]
}
