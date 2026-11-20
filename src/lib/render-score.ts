import { DEFAULT_PREFERRED_WIDTH, type ScoreDocument } from '@m3n/notation'
import type { NotationMode } from './renderer-settings'
import { wrapScorePagesIntoSheets } from '@m3n/score-renderer/view'

export type RenderPhase = 'loading-library' | 'loading-staff' | 'loading-fonts' | 'layout'
export type ScoreRenderInput = {
  scoreDocument: ScoreDocument
  width?: number
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
    check(); input.onPhase?.('layout')
    const render = await prepareStaffScore(input.scoreDocument, input, input.signal)
    const pages = render(input.paged)
    check(); target.replaceChildren(...pages)
    if (input.paged && input.sheetClass) wrapScorePagesIntoSheets(target, input.sheetClass)
    return { message: '' }
  }
  const { NumberedNotationScore, prepareNumberedNotationFonts } = await import('@m3n/numbered-notation')
  check(); input.onPhase?.('loading-fonts')
  await prepareNumberedNotationFonts(input.scoreDocument)
  check(); input.onPhase?.('layout')
  const score = NumberedNotationScore.create(input.scoreDocument)
  // Paper margins and image framing belong to the outer container.
  const markup = score.render({ width: input.width ?? input.scoreDocument.preferredWidth ?? DEFAULT_PREFERRED_WIDTH, paged: input.paged, includeBass: input.includeBass, measureNumbers: input.measureNumbers, fixedDo: input.fixedDo, transpose: input.transpose, tempoScale: input.tempoScale, pageMargin: input.pageMargin ?? 0, coreGap: input.coreGap }).join('')
  check(); target.innerHTML = markup
  if (input.paged && input.sheetClass) wrapScorePagesIntoSheets(target, input.sheetClass)
  return { message: [...new Set(score.diagnostics.filter(item => item.code.startsWith('NUMBERED_')).map(item => item.message))].join('；') }
}
