import type { ScoreDocument } from '@m3n/notation'
import { wrapScorePagesIntoSheets } from '@m3n/score-renderer/view'

export type RenderPhase = 'loading-library' | 'loading-fonts' | 'layout'
export type ScoreRenderInput = {
  scoreDocument: ScoreDocument
  width: number
  paged: boolean
  includeBass?: boolean
  sheetClass?: string
  signal?: AbortSignal
  onPhase?: (phase: RenderPhase) => void
}

/** Screen, print preview and downloads use the same numbered engraving. */
export async function renderScoreInto(target: HTMLElement, input: ScoreRenderInput) {
  const check = () => input.signal?.throwIfAborted()
  check(); input.onPhase?.('loading-library')
  const { NumberedNotationScore, prepareNumberedNotationFonts } = await import('@m3n/numbered-notation')
  check(); input.onPhase?.('loading-fonts')
  await prepareNumberedNotationFonts()
  check(); input.onPhase?.('layout')
  const score = NumberedNotationScore.create(input.scoreDocument)
  const markup = score.render({ width: input.width, paged: input.paged, includeBass: input.includeBass }).join('')
  check(); target.innerHTML = markup
  if (input.paged && input.sheetClass) wrapScorePagesIntoSheets(target, input.sheetClass)
  return { message: [...new Set(score.diagnostics.filter(item => item.code.startsWith('NUMBERED_')).map(item => item.message))].join('；') }
}
