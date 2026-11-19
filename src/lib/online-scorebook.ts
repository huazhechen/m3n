import { parseM3NDocument } from '@m3n/notation'
import { loadPresetScore, presetScores, type PresetScore } from './samples'
import { renderScoreInto } from './render-score'

export const scorebookTitle = 'Max的半音阶口琴乐谱集'
export type ScorebookProgress = { completed: number; total: number; title: string }
export type OnlineScorebook = { pages: SVGSVGElement[]; scoreCount: number }
const svgNS = 'http://www.w3.org/2000/svg'
const website = 'https://score.cheesefans.com/'

export function orderedBookScores(scores: readonly PresetScore[]) {
  return [...scores].sort((a, b) =>
    (a.category?.order ?? Number.MAX_SAFE_INTEGER) - (b.category?.order ?? Number.MAX_SAFE_INTEGER)
    || (a.category?.itemOrder ?? Number.MAX_SAFE_INTEGER) - (b.category?.itemOrder ?? Number.MAX_SAFE_INTEGER)
    || a.title.localeCompare(b.title, 'zh-Hans-CN'))
}

function page() {
  const svg = document.createElementNS(svgNS, 'svg')
  svg.setAttribute('xmlns', svgNS)
  svg.setAttribute('viewBox', '0 0 744 1092')
  svg.setAttribute('width', '744')
  svg.setAttribute('height', '1092')
  return svg
}

function text(svg: SVGSVGElement, value: string, x: number, y: number, size: number, url?: string) {
  const node = document.createElementNS(svgNS, 'text')
  node.textContent = value
  node.setAttribute('x', String(x)); node.setAttribute('y', String(y))
  node.setAttribute('font-size', String(size)); node.setAttribute('font-family', 'serif')
  node.setAttribute('fill', '#000')
  if (url) {
    const link = document.createElementNS(svgNS, 'a')
    link.setAttribute('href', url); link.append(node); svg.append(link)
  } else svg.append(node)
  return node
}

function frontPages(entries: { score: PresetScore; pages: SVGSVGElement[] }[]) {
  const cover = page()
  text(cover, scorebookTitle, 372, 340, 38, website).setAttribute('text-anchor', 'middle')
  text(cover, `共 ${entries.length} 首`, 372, 400, 22).setAttribute('text-anchor', 'middle')
  text(cover, website, 372, 450, 20, website).setAttribute('text-anchor', 'middle')
  const rows: { title: string; entry?: typeof entries[number]; offset?: number }[] = []
  let category: string | undefined, offset = 0
  for (const entry of entries) {
    const next = entry.score.category?.title ?? '其他曲目'
    if (category !== next) { rows.push({ title: next }); category = next }
    rows.push({ title: entry.score.title, entry, offset })
    offset += entry.pages.length
  }
  const perPage = 42, contentsCount = Math.ceil(rows.length / perPage)
  const contents = Array.from({ length: contentsCount }, (_, index) => {
    const svg = page()
    text(svg, '目录', 12, 42, 30)
    rows.slice(index * perPage, (index + 1) * perPage).forEach((row, rowIndex) => {
      const x = rowIndex < 21 ? 12 : 390, y = 100 + rowIndex % 21 * 46
      if (!row.entry) { text(svg, row.title, x, y, 21).setAttribute('font-weight', '700'); return }
      const url = `${website}scores/${encodeURIComponent(row.entry.score.slug)}`
      const label = text(svg, row.title, x, y, 17, url)
      // Reserve a separate column for the page number, including long titles.
      label.setAttribute('textLength', String(Math.min(280, row.title.length * 17)))
      label.setAttribute('lengthAdjust', 'spacingAndGlyphs')
      text(svg, String(2 + contentsCount + row.offset!), x + 324, y, 17, url).setAttribute('text-anchor', 'end')
    })
    return svg
  })
  return [cover, ...contents]
}

/** Uses saved source widths and the normal browser renderer; never writes sources or settings. */
export async function buildOnlineScorebook(signal: AbortSignal, onProgress: (progress: ScorebookProgress) => void): Promise<OnlineScorebook> {
  const scores = orderedBookScores(presetScores)
  if (!scores.length) throw new Error('当前没有可导出的内置乐谱。')
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none;'
  host.setAttribute('aria-hidden', 'true')
  document.body.append(host)
  const entries: { score: PresetScore; pages: SVGSVGElement[] }[] = []
  try {
    for (const score of scores) {
      signal.throwIfAborted()
      onProgress({ completed: entries.length, total: scores.length, title: score.title })
      // Let progress paint and allow cancellation between synchronous engraving passes.
      await new Promise(resolve => setTimeout(resolve, 16))
      signal.throwIfAborted()
      try {
        const source = await loadPresetScore(score.slug)
        signal.throwIfAborted()
        if (!source) throw new Error('乐谱正文缺失，请刷新页面重试。')
        await renderScoreInto(host, { scoreDocument: parseM3NDocument(source), paged: true, signal })
        signal.throwIfAborted()
        const pages = [...host.querySelectorAll<SVGSVGElement>(':scope > svg')]
        if (!pages.length) throw new Error('没有生成可打印的页面。')
        for (const svg of pages) {
          svg.dataset.scoreSlug = score.slug
          for (const title of svg.querySelectorAll('text[font-weight="700"][text-anchor="middle"]:not([data-m3n-role])')) {
            const link = document.createElementNS(svgNS, 'a')
            link.setAttribute('href', `${website}scores/${encodeURIComponent(score.slug)}`)
            title.replaceWith(link); link.append(title)
          }
        }
        entries.push({ score, pages })
        host.replaceChildren()
        onProgress({ completed: entries.length, total: scores.length, title: score.title })
      } catch (error) {
        signal.throwIfAborted()
        throw new Error(`《${score.title}》生成失败：${error instanceof Error ? error.message : '请重试。'}`)
      }
    }
    signal.throwIfAborted()
    return { pages: [...frontPages(entries), ...entries.flatMap(entry => entry.pages)], scoreCount: entries.length }
  } finally { host.remove() }
}
