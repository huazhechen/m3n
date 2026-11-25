import { nativeLayoutQuality } from './native-quality.js'
import { nativeSvgNumber } from './native-svg-number.js'
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
  pageCount(options: NativeRenderOptions): number {
    return layoutNativeScore(this.document, options).pages.length
  }
  render(options: NativeRenderOptions): string[] {
    const layout = layoutNativeScore(this.document, options)
    this.diagnostics = [...layout.projection.diagnostics, ...validateScoreDocument(this.document).filter(diagnostic => diagnostic.code.startsWith('M3N_METER_')).map(diagnostic => ({ code: 'W_METER_MISMATCH', message: diagnostic.message, severity: 'warning' as const }))]
    return renderNativePages(layout)
  }
}

/** Compact layout metrics for choosing among equally short page-width candidates. */
export function numberedLayoutQuality(document: ScoreDocument, options: NativeRenderOptions) {
  return nativeLayoutQuality(layoutNativeScore(document, { ...options, paged: true }))
}


export type { NativeRenderOptions as NumberedNotationRenderOptions } from './native-layout.js'

/** Per-export measured rows, reused for metadata and final SVG generation. */
export class PreparedNumberedNotationScore {
  private readonly layout
  readonly pageCount: number
  readonly systemCount: number
  readonly quality: ReturnType<typeof numberedLayoutQuality>
  readonly width: number
  readonly minimumCoreGap: number
  constructor(document: ScoreDocument, options: Omit<NativeRenderOptions, 'paged' | 'coreGap'>, timings?: Record<string, number>) {
    this.layout = layoutNativeScore(document, { ...options, paged: true }, timings)
    this.pageCount = this.layout.pages.length
    this.systemCount = this.layout.systems.length
    this.quality = nativeLayoutQuality(this.layout)
    this.width = this.layout.options.width
    this.minimumCoreGap = document.minimumCoreGapEm !== undefined ? document.minimumCoreGapEm * nativeStyle.music : nativeStyle.minimumCoreGap
  }
  continuousHeight(coreGap = this.minimumCoreGap) {
    return Math.ceil(nativeSvgNumber(nativeContinuousPagination(this.layout, coreGap).heights[0] ?? 0))
  }
  renderPaged(coreGap?: number) {
    if (!this.layout.options.paged || this.layout.options.coreGap !== coreGap) repaginateNativeLayout(this.layout, true, coreGap)
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
  // Give every score, including the last, an equal share of the spare height.
  const trailingGap = Math.max(0, Math.floor(width * A4_CONTENT_ASPECT_RATIO) - heightAt(coreGap)) / scores.length
  const fittedScoreGap = scoreGap + trailingGap
  return { coreGap, scoreGap: fittedScoreGap, trailingGap, usedHeight: heightAt(coreGap) + trailingGap * scores.length, markup: scores.map(score => score.renderContinuous(coreGap)[0]!) }
}

/** Whole scores on one page, sharing one core parameter and one logical width. */
export function renderSharedNumberedNotationScores(documents: readonly ScoreDocument[], options: Omit<NativeRenderOptions, 'paged' | 'coreGap'>, scoreGap = 22) {
  if (documents.length < 2) throw new Error('A shared page needs at least two scores')
  if (!Number.isFinite(scoreGap) || scoreGap < 0) throw new Error('曲间留白必须为非负有限数值。')
  const minimum = Math.max(...documents.map(document => document.minimumCoreGapEm !== undefined ? document.minimumCoreGapEm * nativeStyle.music : nativeStyle.minimumCoreGap))
  const layouts = documents.map(document => layoutNativeScore(document, { ...options, paged: false, coreGap: minimum }))
  const capacity = Math.floor(layouts[0]!.options.width * A4_CONTENT_ASPECT_RATIO)
  // Continuous SVG viewports round up; fit their real exported heights.
  const heightAt = (gap: number) => layouts.reduce((sum, layout) => sum + Math.ceil(nativeSvgNumber(nativeContinuousPagination(layout, gap).heights[0] ?? 0)), scoreGap * (layouts.length - 1))
  const coreGap = fitNativeCoreGap(heightAt, capacity, minimum, Math.max(32, minimum))
  for (const layout of layouts) reflowNativeContinuousLayout(layout, coreGap)
  const trailingGap = Math.max(0, capacity - heightAt(coreGap)) / layouts.length
  const fittedScoreGap = scoreGap + trailingGap
  return { coreGap, scoreGap: fittedScoreGap, trailingGap, usedHeight: heightAt(coreGap) + trailingGap * layouts.length, markup: layouts.map(layout => renderNativePages(layout)[0]!) }
}
