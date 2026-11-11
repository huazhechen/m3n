import type { ScoreDocument, ScoreHeaderMetadata } from '@m3n/notation'
import {
  a4SourcePageHeight, addScoreHeaderToPaper, avoidLabelCollisions, resolveLyricCollisions,
  scoreHeaderHeight, scoreRenderScheduler, wrapScorePagesIntoSheets,
} from '@m3n/score-renderer/view'

export type RenderPhase = 'loading-library' | 'initializing-engine' | 'loading-fonts' | 'waiting-layout' | 'layout'
export type ScoreRenderInput = {
  mei: string | (() => string)
  scoreDocument?: ScoreDocument
  numberedNotation: boolean
  headerMetadata: ScoreHeaderMetadata[]
  width: number
  paged: boolean
  scale?: number
  includeBass?: boolean
  sheetClass?: string
  signal?: AbortSignal
  onPhase?: (phase: RenderPhase) => void
}
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

/** The same engraving and postprocessing pipeline serves screen, preview and downloads. */
export async function renderScoreInto(target: HTMLElement, input: ScoreRenderInput) {
  const { signal, onPhase } = input
  const check = () => signal?.throwIfAborted()
  check()
  onPhase?.('loading-library')
  let message = ''
  if (input.numberedNotation && input.scoreDocument) {
    const { NumberedNotationScore, prepareNumberedNotationFonts } = await import('@m3n/numbered-notation')
    check(); onPhase?.('loading-fonts')
    await prepareNumberedNotationFonts()
    check(); onPhase?.('layout')
    const score = NumberedNotationScore.create(input.scoreDocument)
    target.innerHTML = score.render({ width: input.width, paged: input.paged, includeBass: input.includeBass }).join('')
    message = [...new Set(score.diagnostics.filter(item => item.code.startsWith('NUMBERED_')).map(item => item.message))].join('；')
  } else {
    const { VerovioScore } = await import('@m3n/score-renderer/verovio')
    check(); onPhase?.('initializing-engine')
    const score = await VerovioScore.create(typeof input.mei === 'function' ? input.mei() : input.mei)
    try {
      check(); onPhase?.('waiting-layout')
      await scoreRenderScheduler.enqueue(async () => {
        check(); onPhase?.('layout')
        const count = score.prepareLayout({ width: input.width, pageHeight: input.paged ? Math.max(1, a4SourcePageHeight(input.width) - scoreHeaderHeight(input.headerMetadata)) : undefined, scale: input.scale ?? 42, includeBass: input.includeBass })
        const pages: string[] = []
        for (let page = 1; page <= count; page += 1) {
          await nextFrame(); check()
          pages.push(score.renderPage(page))
        }
        check()
        target.innerHTML = pages.join('')
        // Verovio leaves nested SVG dimensions implicit. PDF renderers resolve
        // percentages against their output viewport rather than this viewBox.
        // Explicit dimensions keep all pages at the same musical scale.
        for (const page of target.querySelectorAll<SVGSVGElement>(':scope > svg')) {
          const definition = page.querySelector<SVGSVGElement>(':scope > svg.definition-scale')
          if (definition) {
            definition.setAttribute('x', '0'); definition.setAttribute('y', '0')
            definition.setAttribute('width', String(page.viewBox.baseVal.width))
            definition.setAttribute('height', String(page.viewBox.baseVal.height))
          }
        }
        addScoreHeaderToPaper(target, input.headerMetadata)
        resolveLyricCollisions(target)
        avoidLabelCollisions(target)
      })
    } finally { score.destroy() }
  }
  check()
  if (input.paged && input.sheetClass) wrapScorePagesIntoSheets(target, input.sheetClass)
  return { message }
}
