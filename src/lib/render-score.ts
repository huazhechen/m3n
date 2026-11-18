import { DEFAULT_PREFERRED_WIDTH, type ScoreDocument } from '@m3n/notation'
import { wrapScorePagesIntoSheets } from '@m3n/score-renderer/view'

export type RenderPhase = 'loading-library' | 'loading-fonts' | 'layout'
export type ScoreRenderInput = {
  scoreDocument: ScoreDocument
  width?: number
  paged: boolean
  pageMargin?: number
  fixedDo?: boolean
  transpose?: number
  tempoScale?: number
  measureNumbers?: boolean
  includeBass?: boolean
  sheetClass?: string
  signal?: AbortSignal
  onPhase?: (phase: RenderPhase) => void
}

/** Screen, print preview and downloads use the same numbered engraving. */
export type ScoreDisplaySettings = Pick<ScoreRenderInput, 'width' | 'paged' | 'fixedDo' | 'measureNumbers' | 'transpose' | 'tempoScale'> & { width: number }

export async function renderScoreInto(target: HTMLElement, input: ScoreRenderInput) {
  const check = () => input.signal?.throwIfAborted()
  check(); input.onPhase?.('loading-library')
  const { NumberedNotationScore, prepareNumberedNotationFonts } = await import('@m3n/numbered-notation')
  check(); input.onPhase?.('loading-fonts')
  await prepareNumberedNotationFonts()
  check(); input.onPhase?.('layout')
  const score = NumberedNotationScore.create(input.scoreDocument)
  // Paper margins and image framing belong to the outer container.
  const markup = score.render({ width: input.width ?? input.scoreDocument.preferredWidth ?? DEFAULT_PREFERRED_WIDTH, paged: input.paged, includeBass: input.includeBass, measureNumbers: input.measureNumbers, fixedDo: input.fixedDo, transpose: input.transpose, tempoScale: input.tempoScale, pageMargin: input.pageMargin ?? 0 }).join('')
  check(); target.innerHTML = markup
  if (input.paged && input.sheetClass) wrapScorePagesIntoSheets(target, input.sheetClass)
  return { message: [...new Set(score.diagnostics.filter(item => item.code.startsWith('NUMBERED_')).map(item => item.message))].join('；') }
}
