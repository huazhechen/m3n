import { DEFAULT_PREFERRED_WIDTH, type ScoreDocument } from '@m3n/notation'
import type { NotationMode } from './renderer-settings'
import { wrapScorePagesIntoSheets } from '@m3n/score-renderer/view'
import { describeAccessibleScore } from './score-accessibility'
import { attachScoreReading, preserveScoreReading } from './score-reading-dom'
import { numberedLayoutScore } from '../../tools/scorebook-width.mjs'

export type RenderPhase = 'loading-library' | 'loading-staff' | 'loading-fonts' | 'layout'
export type ScoreRenderInput = {
  scoreDocument: ScoreDocument
  width?: number
  autoWidth?: boolean
  paged: boolean
  pageMargin?: number
  coreGap?: number
  notationMode?: NotationMode
  fixedDo?: boolean
  transpose?: number
  tempoScale?: number
  measureNumbers?: boolean
  includeBass?: boolean
  sheetClass?: string
  signal?: AbortSignal
  onPhase?: (phase: RenderPhase) => void
  onWidthSelected?: (width: number) => void
}

const yieldToBrowser = () => new Promise<void>(resolve => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 50 })
  else setTimeout(resolve, 0)
})

export async function chooseNumberedScoreWidth(scoreDocument: ScoreDocument, settings: Omit<ScoreRenderInput, 'scoreDocument' | 'width' | 'autoWidth' | 'signal' | 'onPhase' | 'onWidthSelected'>, signal?: AbortSignal, targetPages?: number) {
  const { numberedLayoutQuality } = await import('@m3n/numbered-notation')
  // Match the application render margin in both the fast and full layout passes.
  settings = { ...settings, pageMargin: settings.pageMargin ?? 0 }
  const options = { ...settings, paged: true }
  const target = targetPages ?? numberedLayoutQuality(scoreDocument, { ...options, width: 640 }).pageCount
  const qualities = [] as { width: number; pageCount: number; lineDensityVariation: number; lastLineSlack: number; score: number }[]
  for (let width = 540; width <= 640; width += 10) {
    await yieldToBrowser()
    signal?.throwIfAborted()
    const quality = numberedLayoutQuality(scoreDocument, { ...options, width })
    if (quality.pageCount <= target) qualities.push({ width, ...quality,
      score: numberedLayoutScore({ width, ...quality }) })
  }
  if (!qualities.length) return 640
  const minimumPages = Math.min(...qualities.map(candidate => candidate.pageCount))
  return qualities.filter(candidate => candidate.pageCount === minimumPages)
    .reduce((best, candidate) => candidate.score > best.score ? candidate : best).width
}

export async function chooseStaffScoreWidth(scoreDocument: ScoreDocument, settings: Omit<ScoreRenderInput, 'scoreDocument' | 'width' | 'autoWidth' | 'signal' | 'onPhase'>, signal?: AbortSignal) {
  const { prepareStaffScore } = await loadStaffResources()
  const render = await prepareStaffScore(scoreDocument, { ...settings, width: 640 }, signal)
  const targetPages = render.pageCount(true, 640)
  const candidates = [] as { width: number; pages: number; score: number }[]
  for (let width = 540; width <= 640; width += 10) {
    signal?.throwIfAborted()
    try {
      const info = render.layoutInfo(width)
      const lines = info.lines as { minimum: number; target: number }[]
      const available = Number(info.availableWidth)
      const densities = lines.map(line => line.minimum / available)
      const mean = densities.reduce((sum, density) => sum + density, 0) / Math.max(1, densities.length)
      const variation = Math.sqrt(densities.reduce((sum, density) => sum + (density - mean) ** 2, 0) / Math.max(1, densities.length)) / Math.max(mean, Number.EPSILON)
      const lastLineSlack = lines.length ? Math.max(0, Math.min(1, 1 - lines.at(-1)!.target / available)) : 0
      if (Number(info.pageCount) > 0 && Number(info.pageCount) <= targetPages) candidates.push({ width, pages: Number(info.pageCount),
        score: (540 / width) / (1 + variation + 0.5 * lastLineSlack) })
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('单个五线谱谱行')) throw error
    }
  }
  if (!candidates.length) return 640
  const minimumPages = Math.min(...candidates.map(candidate => candidate.pages))
  return candidates.filter(candidate => candidate.pages === minimumPages)
    .reduce((best, candidate) => candidate.score > best.score ? candidate : best).width
}

/** Screen, print preview and downloads share the selected notation and settings. */
export type ScoreDisplaySettings = Pick<ScoreRenderInput, 'width' | 'paged' | 'notationMode' | 'fixedDo' | 'measureNumbers' | 'transpose' | 'tempoScale'> & { width: number }

let staffResourcesReady = false
let staffResourcesRequest: Promise<typeof import('@m3n/score-renderer/staff')> | undefined
function loadStaffResources(onPhase?: ScoreRenderInput['onPhase']) {
  if (!staffResourcesReady) onPhase?.('loading-staff')
  staffResourcesRequest ??= (async () => {
    const renderer = await import('@m3n/score-renderer/staff')
    await renderer.prepareStaffResources()
    staffResourcesReady = true
    return renderer
  })().catch(error => { staffResourcesRequest = undefined; throw error })
  return staffResourcesRequest
}

/** One measurement per open export dialog; changing pagination reuses the rows. */
export async function prepareScoreExport(scoreDocument: ScoreDocument, settings: ScoreDisplaySettings, signal: AbortSignal) {
  if (settings.notationMode === 'staff') {
    const { prepareStaffScore } = await loadStaffResources()
    return prepareStaffScore(scoreDocument, settings, signal)
  }
  const { PreparedNumberedNotationScore, prepareNumberedNotationFonts } = await import('@m3n/numbered-notation')
  await prepareNumberedNotationFonts(scoreDocument)
  signal.throwIfAborted()
  const score = new PreparedNumberedNotationScore(scoreDocument, { ...settings, pageMargin: 0 })
  return (paged: boolean) => {
    signal.throwIfAborted()
    const host = document.createElement('div')
    host.innerHTML = (paged ? score.renderPaged() : score.renderContinuous()).join('')
    return [...host.querySelectorAll<SVGSVGElement>(':scope > svg')]
  }
}

export async function renderScoreInto(target: HTMLElement, input: ScoreRenderInput) {
  const check = () => input.signal?.throwIfAborted()
  check(); input.onPhase?.('loading-library')
  if (input.notationMode === 'staff') {
    const { prepareStaffScore } = await loadStaffResources(input.onPhase)
    const width = input.autoWidth ? await chooseStaffScoreWidth(input.scoreDocument, input, input.signal) : input.width
    check(); input.onPhase?.('layout')
    const render = await prepareStaffScore(input.scoreDocument, { ...input, width }, input.signal)
    const pages = render(input.paged)
    check()
    const restoreReading = preserveScoreReading(target, input.scoreDocument)
    target.replaceChildren(...pages)
    if (input.paged && input.sheetClass) wrapScorePagesIntoSheets(target, input.sheetClass)
    attachScoreReading(target, describeAccessibleScore(input.scoreDocument, { ...input, forDisplay: true }))
    restoreReading()
    return { message: '', width, widthPending: false }
  }
  const { NumberedNotationScore, prepareNumberedNotationFonts } = await import('@m3n/numbered-notation')
  check(); input.onPhase?.('loading-fonts')
  await prepareNumberedNotationFonts(input.scoreDocument)
  check(); input.onPhase?.('layout')
  // Paper margins and image framing belong to the outer container.
  const width = input.autoWidth ? 640 : input.width ?? DEFAULT_PREFERRED_WIDTH
  const score = NumberedNotationScore.create(input.scoreDocument)
  const markup = score.render({ width, paged: input.paged, includeBass: input.includeBass, measureNumbers: input.measureNumbers, fixedDo: input.fixedDo, transpose: input.transpose, tempoScale: input.tempoScale, pageMargin: input.pageMargin ?? 0, coreGap: input.coreGap }).join('')
  check()
  const restoreReading = preserveScoreReading(target, input.scoreDocument)
  target.innerHTML = markup
  if (input.paged && input.sheetClass) wrapScorePagesIntoSheets(target, input.sheetClass)
  attachScoreReading(target, describeAccessibleScore(input.scoreDocument, { ...input, forDisplay: true }))
  restoreReading()
  if (input.autoWidth) {
    const targetPages = input.paged
      ? target.querySelectorAll('.score-page-sheet > svg').length || target.querySelectorAll(':scope > svg').length
      : undefined
    void yieldToBrowser().then(() => chooseNumberedScoreWidth(input.scoreDocument, input, input.signal, targetPages))
      .then(selected => {
        if (!input.signal?.aborted) input.onWidthSelected?.(selected)
      }).catch(error => {
        if (error instanceof Error && error.name !== 'AbortError') console.error('曲谱版宽选择失败', error)
      })
  }
  return { message: [...new Set(score.diagnostics.filter(item => item.code.startsWith('NUMBERED_')).map(item => item.message))].join('；'), width, widthPending: Boolean(input.autoWidth) }
}
