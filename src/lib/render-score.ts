import { DEFAULT_PREFERRED_WIDTH, type ScoreDocument } from '@m3n/notation'
import type { NotationMode } from './renderer-settings'
import { wrapScorePagesIntoSheets } from '@m3n/score-renderer/view'
import { describeAccessibleScore } from './score-accessibility'
import { attachScoreReading, preserveScoreReading } from './score-reading-dom'

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
  const { NumberedNotationScore } = await import('@m3n/numbered-notation')
  const score = NumberedNotationScore.create(scoreDocument)
  // Match the application render margin in both the fast and full layout passes.
  settings = { ...settings, pageMargin: settings.pageMargin ?? 0 }
  const options = { ...settings, paged: true, minimumNoteGapEm: 0.4 }
  const pageCount = (width: number) => {
    signal?.throwIfAborted()
    return score.pageCount({ ...options, width })
  }
  const target = targetPages ?? score.pageCount({ ...settings, width: 640, paged: true })
  let lower = 540
  let upper = 640
  for (const width of [540, 600]) {
    await yieldToBrowser()
    const pages = pageCount(width)
    if (pages <= target) {
      upper = width
      break
    }
    lower = width
  }
  if (upper !== 540) {
    while (upper - lower > 10) {
      await yieldToBrowser()
      const width = Math.floor(((lower + upper) / 2) / 10) * 10
      if (pageCount(width) <= target) upper = width
      else lower = width
    }
  }
  if (upper === 640) return upper

  const formalPageCount = async (width: number) => {
    await yieldToBrowser()
    signal?.throwIfAborted()
    return score.pageCount({ ...settings, width, paged: true })
  }
  if (await formalPageCount(upper) <= target) return upper
  lower = upper
  upper = 640
  while (upper - lower > 10) {
    const width = Math.floor(((lower + upper) / 2) / 10) * 10
    if (await formalPageCount(width) <= target) upper = width
    else lower = width
  }
  return upper
}

export async function chooseStaffScoreWidth(scoreDocument: ScoreDocument, settings: Omit<ScoreRenderInput, 'scoreDocument' | 'width' | 'autoWidth' | 'signal' | 'onPhase'>, signal?: AbortSignal) {
  const { prepareStaffScore } = await loadStaffResources()
  const render = await prepareStaffScore(scoreDocument, { ...settings, width: 640 }, signal)
  const targetPages = render.pageCount(true, 640)
  const pages = (width: number) => render.pageCount(true, width)
  let low = 540, high = 640
  while (low < high) {
    signal?.throwIfAborted()
    const middle = Math.floor(((low + high) / 2) / 10) * 10
    if (pages(middle) <= targetPages) high = middle
    else low = middle + 10
  }
  return low
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
