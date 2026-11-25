import type { ScoreDocument } from '@m3n/notation'
import { DEFAULT_SCORE_WIDTH, type NotationMode } from './renderer-settings'
import { wrapScorePagesIntoSheets } from '@m3n/score-renderer/view'
import { describeAccessibleScore } from './score-accessibility'
import { attachScoreReading, preserveScoreReading } from './score-reading-dom'
import { selectBestWidth } from '../../tools/scorebook-width.mjs'
import type { NumberedTextMeasurementCache } from '@m3n/numbered-notation'

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
  textMeasurementCache?: NumberedTextMeasurementCache
  sheetClass?: string
  signal?: AbortSignal
  onPhase?: (phase: RenderPhase) => void
}

const yieldToBrowser = () => new Promise<void>(resolve => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 50 })
  else setTimeout(resolve, 0)
})

// A phase update needs a paint before synchronous layout can occupy the main thread.
const yieldToPaint = () => new Promise<void>(resolve => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0))
  else setTimeout(resolve, 0)
})

type WidthSettings = Omit<ScoreRenderInput, 'scoreDocument' | 'width' | 'autoWidth' | 'signal' | 'onPhase'>

export async function chooseNumberedScoreWidth(scoreDocument: ScoreDocument, settings: WidthSettings, signal?: AbortSignal) {
  const { prepareNumberedNotationFonts, NumberedTextMeasurementCache, NumberedLayoutTask } = await import('@m3n/numbered-notation')
  const { measureNumberedWidth } = await import('../../tools/lib/numbered-width-measurement.mjs')
  await prepareNumberedNotationFonts(scoreDocument)
  const taskSettings = { ...settings, textMeasurementCache: settings.textMeasurementCache ?? new NumberedTextMeasurementCache(), layoutTask: new NumberedLayoutTask() }
  const { best } = await selectBestWidth(async width => {
    await yieldToBrowser()
    signal?.throwIfAborted()
    return measureNumberedWidth(scoreDocument, width, { settings: taskSettings, signal }).candidate
  }, { signal })
  return best.width
}

export async function chooseStaffScoreWidth(scoreDocument: ScoreDocument, settings: WidthSettings, signal?: AbortSignal) {
  const { prepareStaffMeasurementTask } = await loadStaffResources()
  const task = await prepareStaffMeasurementTask(scoreDocument, settings, signal)
  const { measureStaffWidth } = await import('../../tools/lib/staff-width-measurement.mjs')
  const { best } = await selectBestWidth(async width => {
    await yieldToBrowser()
    signal?.throwIfAborted()
    return measureStaffWidth(scoreDocument, width, settings, signal, { task })
  }, { signal })
  return best.width
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
  check()
  if (input.autoWidth) delete target.dataset.selectedWidth
  input.onPhase?.('loading-library')
  if (input.notationMode === 'staff') {
    const { prepareStaffScore } = await loadStaffResources(input.onPhase)
    check(); input.onPhase?.('layout')
    await yieldToPaint()
    check()
    const width = input.autoWidth ? await chooseStaffScoreWidth(input.scoreDocument, input, input.signal) : input.width
    check()
    const render = await prepareStaffScore(input.scoreDocument, { ...input, width }, input.signal)
    const pages = render(input.paged)
    check()
    const restoreReading = preserveScoreReading(target, input.scoreDocument)
    target.replaceChildren(...pages)
    if (input.paged && input.sheetClass) wrapScorePagesIntoSheets(target, input.sheetClass)
    attachScoreReading(target, describeAccessibleScore(input.scoreDocument, { ...input, forDisplay: true }))
    restoreReading()
    if (input.autoWidth) target.dataset.selectedWidth = String(width)
    return { message: '', width }
  }
  const { NumberedNotationScore, prepareNumberedNotationFonts, NumberedTextMeasurementCache } = await import('@m3n/numbered-notation')
  check(); input.onPhase?.('loading-fonts')
  await prepareNumberedNotationFonts(input.scoreDocument)
  check(); input.onPhase?.('layout')
  await yieldToPaint()
  check()
  // Paper margins and image framing belong to the outer container.
  const textMeasurementCache = input.textMeasurementCache ?? new NumberedTextMeasurementCache()
  const width = input.autoWidth
    ? await chooseNumberedScoreWidth(input.scoreDocument, { ...input, textMeasurementCache }, input.signal)
    : input.width ?? DEFAULT_SCORE_WIDTH
  check()
  const score = NumberedNotationScore.create(input.scoreDocument)
  const markup = score.render({ width, paged: input.paged, includeBass: input.includeBass, measureNumbers: input.measureNumbers, fixedDo: input.fixedDo, transpose: input.transpose, tempoScale: input.tempoScale, pageMargin: input.pageMargin ?? 0, coreGap: input.coreGap, textMeasurementCache }).join('')
  check()
  const restoreReading = preserveScoreReading(target, input.scoreDocument)
  target.innerHTML = markup
  if (input.paged && input.sheetClass) wrapScorePagesIntoSheets(target, input.sheetClass)
  attachScoreReading(target, describeAccessibleScore(input.scoreDocument, { ...input, forDisplay: true }))
  restoreReading()
  if (input.autoWidth) target.dataset.selectedWidth = String(width)
  return { message: [...new Set(score.diagnostics.filter(item => item.code.startsWith('NUMBERED_')).map(item => item.message))].join('；'), width }
}
