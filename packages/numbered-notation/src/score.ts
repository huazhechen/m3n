import { CanvasTextMeasurer, compileScore, ErrorDiagnostic, type TextMeasurer } from '@m3n/jpfun'
import type { ScoreDocument } from '@m3n/notation'
import { projectNumberedScore, type NumberedNotationDiagnostic } from './projection.js'
import { renderInteractivePages } from './svg.js'

export type NumberedNotationRenderOptions = {
  paged: boolean
  width: number
  includeBass?: boolean
  textMeasurer?: TextMeasurer
}

/** Pure frontend jpFun adapter; ScoreDocument is the only musical input. */
export class NumberedNotationScore {
  diagnostics: NumberedNotationDiagnostic[] = []
  private constructor(private readonly document: ScoreDocument) {}
  static create(document: ScoreDocument) { return new NumberedNotationScore(document) }

  render(options: NumberedNotationRenderOptions): string[] {
    if (!Number.isFinite(options.width)) throw new Error('简谱宽度必须为有限数值。')
    const projection = projectNumberedScore(this.document, { ...options, width: Math.max(320, Math.round(options.width)) })
    const canvas = typeof document === 'undefined' || typeof CanvasRenderingContext2D === 'undefined' ? null : document.createElement('canvas')
    const context = canvas?.getContext('2d')
    const textMeasurer = options.textMeasurer ?? (context ? new CanvasTextMeasurer(context) : undefined)
    const result = compileScore(projection.source, { autoWrap: true, textMeasurer })
    this.diagnostics = [...projection.diagnostics, ...result.diagnostics.map(item => ({ code: item.code, message: item.message, severity: item instanceof ErrorDiagnostic ? 'error' as const : 'warning' as const }))]
    const error = this.diagnostics.find(item => item.severity === 'error')
    if (error) throw new Error(`简谱排版失败：${error.message}`)
    return renderInteractivePages(result, projection)
  }
}
