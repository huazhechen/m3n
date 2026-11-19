import plan from '../../scorebook/editorial-plan.json'
import { DEFAULT_PREFERRED_WIDTH, parseM3NDocument } from '@m3n/notation'
import { PreparedNumberedNotationScore, prepareNumberedNotationFonts, renderSharedPreparedNumberedNotationScores } from '@m3n/numbered-notation'
import { a4ImagePlacement } from '@m3n/score-renderer/view'
import { loadPresetScore, presetScores } from './samples'
import type { WidthMeasurement } from '../../tools/scorebook-width.mjs'
import { optimizeScorebook, sharedScoreGap, sharedScoreWidth, type PackingEntry } from '../../tools/scorebook-packing.mjs'

export const scorebookTitle = plan.title
export type ScorebookProgress = { completed: number; total: number; title: string; phase?: 'measuring' | 'packing' | 'rendering' }
export type OnlineScorebook = { pages: SVGSVGElement[]; scoreCount: number; sharedPages: number }
type BookEntry = PackingEntry & { file: string; prepared: Map<number, PreparedNumberedNotationScore>; slug: string; musicStart: number; pageCount: number }
const svgNS = 'http://www.w3.org/2000/svg'
const website = 'https://score.cheesefans.com/'

function page(markup = '') {
  const svg = document.createElementNS(svgNS, 'svg')
  svg.setAttribute('xmlns', svgNS)
  svg.setAttribute('viewBox', `0 0 ${plan.page.width} ${plan.page.height}`)
  svg.setAttribute('width', String(plan.page.width))
  svg.setAttribute('height', String(plan.page.height))
  // These are complete A4 pages; printing must not add a second paper margin.
  svg.innerHTML = `<rect width="100%" height="100%" fill="white"/>${markup}`
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

function frontPages(entries: BookEntry[]) {
  // Match the script's 25-row columns and keep chapter headings with a song.
  type Row = { section: typeof plan.sections[number] } | { entry: BookEntry }
  const columns: Row[][] = []
  for (const section of plan.sections) {
    const rows: Row[] = [{ section }, ...entries.filter(entry => entry.section === section.id).map(entry => ({ entry }))]
    for (const row of rows) {
      let column = columns.at(-1)
      if (!column || column.length >= 25 || 'section' in row && column.length === 24) {
        column = []; columns.push(column)
      }
      column.push(row)
    }
  }
  const contentsCount = Math.ceil(columns.length / 2), frontCount = 1 + contentsCount
  const cover = page()
  text(cover, scorebookTitle, plan.page.width / 2, 350, 40, website).setAttribute('text-anchor', 'middle')
  text(cover, website, plan.page.width / 2, 410, 18, website).setAttribute('text-anchor', 'middle')
  const contents = Array.from({ length: contentsCount }, (_, index) => {
    const svg = page()
    text(svg, '目录', 40, 65, 30)
    for (let side = 0; side < 2; side++) {
      const x = 40 + side * 377
      for (const [rowIndex, row] of (columns[index * 2 + side] ?? []).entries()) {
        const y = 120 + rowIndex * 37
        if ('section' in row) { text(svg, row.section.title, x, y, 16); continue }
        const entry = row.entry, first = frontCount + entry.musicStart + 1
        const label = entry.pageCount === 1 ? String(first) : `${first}–${first + entry.pageCount - 1}`
        const url = `${website}scores/${encodeURIComponent(entry.slug)}`
        text(svg, entry.title, x, y, 16, url)
        text(svg, label, x + 337, y, 14, url).setAttribute('text-anchor', 'end')
      }
    }
    return svg
  })
  return [cover, ...contents]
}

function linkScores(svg: SVGSVGElement, entries: BookEntry[]) {
  const scores = [...svg.querySelectorAll<SVGSVGElement>('svg[data-engine="m3n"]')]
  if (scores.length !== entries.length) throw new Error('谱集页面与曲目数量不一致。')
  scores.forEach((score, index) => {
    score.dataset.scoreSlug = entries[index].slug
    for (const title of score.querySelectorAll('text[font-weight="700"][text-anchor="middle"]:not([data-m3n-role])')) {
      const link = document.createElementNS(svgNS, 'a')
      link.setAttribute('href', `${website}scores/${encodeURIComponent(entries[index].slug)}`)
      title.replaceWith(link); link.append(title)
    }
  })
}

/** Reuse measured layouts within one export; every invocation starts from the current sources. */
export async function buildOnlineScorebook(signal: AbortSignal, onProgress: (progress: ScorebookProgress) => void): Promise<OnlineScorebook> {
  const files = new Map(presetScores.map(score => [score.sourcePath, score]))
  if (files.size !== plan.entries.length || plan.entries.some(entry => !files.has(entry.file))) {
    throw new Error('谱集配置与内置曲库不一致，请刷新页面重试。')
  }
  const entries: BookEntry[] = [], music: SVGSVGElement[] = []
  const pause = async () => { await new Promise(resolve => setTimeout(resolve, 0)); signal.throwIfAborted() }
  try {
    signal.throwIfAborted()
    await prepareNumberedNotationFonts()
    for (const [index, entry] of plan.entries.entries()) {
      signal.throwIfAborted()
      const progress = (fraction = 0) => onProgress({ completed: index + fraction, total: plan.entries.length, title: entry.title, phase: 'measuring' })
      progress()
      try {
        const source = await loadPresetScore(files.get(entry.file)!.slug)
        signal.throwIfAborted()
        if (!source) throw new Error('乐谱正文缺失，请刷新页面重试。')
        const document = parseM3NDocument(source)
        const preferredWidth = files.get(entry.file)!.preferredWidth ?? DEFAULT_PREFERRED_WIDTH
        const candidates: WidthMeasurement[] = []
        const prepared = new Map<number, PreparedNumberedNotationScore>()
        const widths = [...new Set('sharePage' in entry && entry.sharePage === false ? [preferredWidth] : [preferredWidth, sharedScoreWidth])]
        for (const [widthIndex, width] of widths.entries()) {
          await pause()
          let result: WidthMeasurement
          try {
            const score = new PreparedNumberedNotationScore(document, { width, pageMargin: 0 })
            prepared.set(width, score)
            result = { width, pageCount: score.pageCount, rows: 0, outside: [], overlaps: [],
              naturalHeight: score.pageCount === 1 ? score.continuousHeight() : undefined }
          }
          catch (error) { result = { width, error: error instanceof Error ? error.message : String(error), pageCount: 0, rows: 0, outside: [], overlaps: [] } }
          signal.throwIfAborted()
          candidates.push(result)
          progress((widthIndex + 1) / widths.length)
        }
        const solo = candidates.find(candidate => candidate.width === preferredWidth)!
        if (solo.error || !solo.pageCount) throw new Error('当前优选宽度无法完成排版，请检查谱源。')
        entries.push({ ...entry, prepared, slug: files.get(entry.file)!.slug, preferredWidth, candidates, musicStart: 0, pageCount: 0 })
      } catch (error) {
        signal.throwIfAborted()
        throw new Error(`《${entry.title}》生成失败：${error instanceof Error ? error.message : '请重试。'}`)
      }
    }
    onProgress({ completed: 0, total: entries.length, title: '正在安排章节与合页…', phase: 'packing' })
    await pause()
    const packed = optimizeScorebook(entries, new Set(plan.sections.filter(section => section.reorderForSharing).map(section => section.id)))
    let sharedPages = 0
    for (const group of packed.groups) {
      const members = packed.entries.slice(group.start, group.end)
      onProgress({ completed: group.start, total: entries.length, title: members.map(entry => entry.title).join(' / '), phase: 'rendering' })
      await pause()
      const start = music.length
      if (members.length > 1) {
        const rendered = renderSharedPreparedNumberedNotationScores(members.map(entry => entry.prepared.get(group.width)!), sharedScoreGap)
        const svg = page(rendered.markup.join(''))
        let top = 0
        for (const score of svg.querySelectorAll<SVGSVGElement>(':scope > svg')) {
          const height = score.viewBox.baseVal.height
          placeScore(score, { x: 12, y: 12 + top * 186 / group.width, width: 186, height: height * 186 / group.width })
          top += height + rendered.scoreGap
        }
        linkScores(svg, members); music.push(svg); sharedPages++
      } else {
        const rendered = members[0].prepared.get(group.width)!.renderPaged()
        if (rendered.length !== group.pageCount) throw new Error(`《${members[0].title}》分页结果已改变，请重试。`)
        for (const markup of rendered) {
          const svg = page(markup)
          const score = svg.querySelector<SVGSVGElement>(':scope > svg')!
          placeScore(score, a4ImagePlacement(score.viewBox.baseVal.width, score.viewBox.baseVal.height))
          linkScores(svg, members); music.push(svg)
        }
      }
      for (const entry of members) { entry.musicStart = start; entry.pageCount = group.pageCount }
      onProgress({ completed: group.end, total: entries.length, title: members.map(entry => entry.title).join(' / '), phase: 'rendering' })
    }
    signal.throwIfAborted()
    return { pages: [...frontPages(packed.entries), ...music], scoreCount: entries.length, sharedPages }
  } finally { entries.length = 0 }
}

function placeScore(svg: SVGSVGElement, placement: { x: number; y: number; width: number; height: number }) {
  for (const [key, value] of Object.entries(placement)) svg.setAttribute(key, String(value * 96 / 25.4))
}
