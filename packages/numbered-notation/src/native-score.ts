import { A4_CONTENT_ASPECT_RATIO, validateScoreDocument, type ScoreDocument } from '@m3n/notation'
import { layoutNativeScore, nativeContinuousPagination, reflowNativeContinuousLayout, repaginateNativeLayout, type NativeRenderOptions } from './native-layout.js'
import { renderNativePages } from './native-svg.js'
import { fitNativeCoreGap } from './native-pagination.js'
import { nativeStyle } from './native-style.js'
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

/** Per-export measured rows, reused for metadata and final SVG generation. */
export class PreparedNumberedNotationScore {
  private readonly layout
  readonly pageCount: number
  readonly width: number
  readonly minimumCoreGap: number
  constructor(document: ScoreDocument, options: Omit<NativeRenderOptions, 'paged' | 'coreGap'>) {
    this.layout = layoutNativeScore(document, { ...options, paged: true })
    this.pageCount = this.layout.pages.length
    this.width = this.layout.options.width
    this.minimumCoreGap = document.minimumCoreGapEm !== undefined ? document.minimumCoreGapEm * nativeStyle.music : nativeStyle.minimumCoreGap
  }
  continuousHeight(coreGap = this.minimumCoreGap) {
    return Math.ceil(nativeContinuousPagination(this.layout, coreGap).heights[0] ?? 0)
  }
  renderPaged() {
    if (!this.layout.options.paged || this.layout.options.coreGap !== undefined) repaginateNativeLayout(this.layout, true)
    return renderNativePages(this.layout)
  }
  renderContinuous(coreGap = this.minimumCoreGap) {
    repaginateNativeLayout(this.layout, false, coreGap)
    return renderNativePages(this.layout)
  }
}

/** Same shared-page fitting as the script, reusing this export's measured rows. */
export function renderSharedPreparedNumberedNotationScores(scores: readonly PreparedNumberedNotationScore[], scoreGap = 22) {
  if (scores.length < 2) throw new Error('A shared page needs at least two scores')
  if (!Number.isFinite(scoreGap) || scoreGap < 0) throw new Error('曲间留白必须为非负有限数值。')
  const width = scores[0]!.width
  if (scores.some(score => score.width !== width)) throw new Error('合页曲目必须使用相同版宽。')
  const minimum = Math.max(...scores.map(score => score.minimumCoreGap))
  const heightAt = (gap: number) => scores.reduce((sum, score) => sum + score.continuousHeight(gap), scoreGap * (scores.length - 1))
  const coreGap = fitNativeCoreGap(heightAt, Math.floor(width * A4_CONTENT_ASPECT_RATIO), minimum, Math.max(32, minimum))
  return { coreGap, usedHeight: heightAt(coreGap), markup: scores.map(score => score.renderContinuous(coreGap)[0]!) }
}

/** Whole scores on one page, sharing one core parameter and one logical width. */
export function renderSharedNumberedNotationScores(documents: readonly ScoreDocument[], options: Omit<NativeRenderOptions, 'paged' | 'coreGap'>, scoreGap = 22) {
  if (documents.length < 2) throw new Error('A shared page needs at least two scores')
  if (!Number.isFinite(scoreGap) || scoreGap < 0) throw new Error('曲间留白必须为非负有限数值。')
  const minimum = Math.max(...documents.map(document => document.minimumCoreGapEm !== undefined ? document.minimumCoreGapEm * nativeStyle.music : nativeStyle.minimumCoreGap))
  const layouts = documents.map(document => layoutNativeScore(document, { ...options, paged: false, coreGap: minimum }))
  const capacity = Math.floor(layouts[0]!.options.width * A4_CONTENT_ASPECT_RATIO)
  // Continuous SVG viewports round up; fit their real exported heights.
  const heightAt = (gap: number) => layouts.reduce((sum, layout) => sum + Math.ceil(nativeContinuousPagination(layout, gap).heights[0] ?? 0), scoreGap * (layouts.length - 1))
  const coreGap = fitNativeCoreGap(heightAt, capacity, minimum, Math.max(32, minimum))
  for (const layout of layouts) reflowNativeContinuousLayout(layout, coreGap)
  return { coreGap, usedHeight: heightAt(coreGap), markup: layouts.map(layout => renderNativePages(layout)[0]!) }
}
