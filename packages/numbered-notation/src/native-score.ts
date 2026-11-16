import { validateScoreDocument, type ScoreDocument } from '@m3n/notation'
import { layoutNativeScore, type NativeRenderOptions } from './native-layout.js'
import { renderNativePages } from './native-svg.js'
import type { NativeDiagnostic } from './native-model.js'

/** Native music engraving, with ScoreDocument as its only musical input. */
export class NativeNumberedNotationScore {
  diagnostics: NativeDiagnostic[] = []
  private constructor(private readonly document: ScoreDocument) {}
  static create(document: ScoreDocument) { return new NativeNumberedNotationScore(document) }
  render(options: NativeRenderOptions): string[] {
    const layout = layoutNativeScore(this.document, options)
    this.diagnostics = [...layout.projection.diagnostics, ...validateScoreDocument(this.document).filter(diagnostic => diagnostic.code.startsWith('M3N_METER_')).map(diagnostic => ({ code: 'W_METER_MISMATCH', message: diagnostic.message, severity: 'warning' as const }))]
    return renderNativePages(layout)
  }
}

export type { NativeRenderOptions as NumberedNotationRenderOptions } from './native-layout.js'
