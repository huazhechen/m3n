import { DEFAULT_PREFERRED_WIDTH, type ScoreDocument } from '@m3n/notation'
import type { NotationMode } from './renderer-settings'
import { wrapScorePagesIntoSheets } from '@m3n/score-renderer/view'

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
}

export function chooseNumberedScoreWidth(scoreDocument: ScoreDocument, settings: Omit<ScoreRenderInput, 'scoreDocument' | 'width' | 'autoWidth' | 'signal' | 'onPhase'>, signal?: AbortSignal) {
  return import('@m3n/numbered-notation').then(async ({ NumberedNotationScore, prepareNumberedNotationFonts }) => {
    await prepareNumberedNotationFonts(scoreDocument)
    signal?.throwIfAborted()
    const score = NumberedNotationScore.create(scoreDocument)
    const pageCount = (width: number) => score.pageCount({ width, paged: true, includeBass: settings.includeBass, measureNumbers: settings.measureNumbers, fixedDo: settings.fixedDo, transpose: settings.transpose, tempoScale: settings.tempoScale, pageMargin: settings.pageMargin ?? 0, coreGap: settings.coreGap })
    const targetPages = pageCount(640)
    let low = 480, high = 640
    while (low < high) {
      signal?.throwIfAborted()
      const middle = Math.floor(((low + high) / 2) / 10) * 10
      if (pageCount(middle) <= targetPages) high = middle
      else low = middle + 10
    }
    return low
  })
}

export async function chooseStaffScoreWidth(scoreDocument: ScoreDocument, settings: Omit<ScoreRenderInput, 'scoreDocument' | 'width' | 'autoWidth' | 'signal' | 'onPhase'>, signal?: AbortSignal) {
  const { prepareStaffScore } = await loadStaffResources()
  const render = await prepareStaffScore(scoreDocument, { ...settings, width: 640 }, signal)
  const targetPages = render.pageCount(true, 640)
  const pages = (width: number) => render.pageCount(true, width)
  let low = 480, high = 640
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
    check(); target.replaceChildren(...pages)
    if (input.paged && input.sheetClass) wrapScorePagesIntoSheets(target, input.sheetClass)
    return { message: '', width }
  }
  const { NumberedNotationScore, prepareNumberedNotationFonts } = await import('@m3n/numbered-notation')
  check(); input.onPhase?.('loading-fonts')
  await prepareNumberedNotationFonts(input.scoreDocument)
  check(); input.onPhase?.('layout')
  // Paper margins and image framing belong to the outer container.
  const width = input.autoWidth
    ? await chooseNumberedScoreWidth(input.scoreDocument, input, input.signal)
    : input.width ?? DEFAULT_PREFERRED_WIDTH
  const score = NumberedNotationScore.create(input.scoreDocument)
  const markup = score.render({ width, paged: input.paged, includeBass: input.includeBass, measureNumbers: input.measureNumbers, fixedDo: input.fixedDo, transpose: input.transpose, tempoScale: input.tempoScale, pageMargin: input.pageMargin ?? 0, coreGap: input.coreGap }).join('')
  check(); target.innerHTML = markup
  if (input.paged && input.sheetClass) wrapScorePagesIntoSheets(target, input.sheetClass)
  return { message: [...new Set(score.diagnostics.filter(item => item.code.startsWith('NUMBERED_')).map(item => item.message))].join('；'), width }
}
