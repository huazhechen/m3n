import { scoreVerticalSpacing } from './layout/policy.js'
import { nativeLayoutQuality } from './native-quality.js'
import { nativeSvgNumber } from './native-svg-number.js'
import { A4_CONTENT_ASPECT_RATIO, validateScoreDocument, type ScoreDocument } from '@m3n/notation'
import { layoutNativeScore, measureNativeLayout, prepareNativeMeasurement, nativeContinuousPagination, repaginateNativeLayout, type NativeRenderOptions } from './native-layout.js'
import { renderNativePages } from './native-svg.js'
import { fitSharedScorePage } from './layout/pagination.js'
import { nativeHeaderGap } from './native-style.js'
import type { NativeDiagnostic } from './native-model.js'

/** Native music engraving, with ScoreDocument as its only musical input. */
export class NativeNumberedNotationScore {
  diagnostics: NativeDiagnostic[] = []
  private constructor(private readonly document: ScoreDocument) {}
  static create(document: ScoreDocument) { return new NativeNumberedNotationScore(document) }
  pageCount(options: NativeRenderOptions): number {
    return layoutNativeScore(this.document, { numericLayout: true, ...options }).pages.length
  }
  render(options: NativeRenderOptions): string[] {
    const layout = layoutNativeScore(this.document, { numericLayout: true, ...options })
    this.diagnostics = [...layout.projection.diagnostics, ...validateScoreDocument(this.document).filter(diagnostic => diagnostic.code.startsWith('M3N_METER_')).map(diagnostic => ({ code: 'W_METER_MISMATCH', message: diagnostic.message, severity: 'warning' as const }))]
    return renderNativePages(layout)
  }
}

/** Compact layout metrics for choosing among equally short page-width candidates. */
export function numberedLayoutQuality(document: ScoreDocument, options: NativeRenderOptions) {
  return nativeLayoutQuality(layoutNativeScore(document, { numericLayout: true, ...options, paged: true }))
}


export type { NativeRenderOptions as NumberedNotationRenderOptions } from './native-layout.js'

/** Per-export measured rows, reused for metadata and final SVG generation. */
export class PreparedNumberedNotationScore {
  private placedLayout?: ReturnType<typeof layoutNativeScore>
  private readonly measurement?: ReturnType<typeof measureNativeLayout>
  private readonly document: ScoreDocument
  private readonly options: Omit<NativeRenderOptions, 'paged' | 'coreGap'>
  private get layout() {
    return this.placedLayout ??= layoutNativeScore(this.document, { numericLayout: true, ...this.options, paged: true })
  }
  /** Width selection may retain this handle without retaining mutable arena
   * glyphs. Rendering materializes one independently owned layout on demand. */
  static measure(document: ScoreDocument, options: Omit<NativeRenderOptions, 'paged' | 'coreGap'>, timings?: Record<string, number>, minimumQuality?: number, maximumPageCount?: number) {
    return new PreparedNumberedNotationScore(document, options, timings, minimumQuality, maximumPageCount, true)
  }
  static prepareMeasurement(document: ScoreDocument, options: Omit<NativeRenderOptions, 'paged' | 'coreGap'>, timings?: Record<string, number>) {
    const prepared = prepareNativeMeasurement(document, { numericLayout: true, ...options, paged: true }, timings)
    return { lowerBound: prepared.lowerBound, horizontalLowerBound: prepared.horizontalLowerBound, rowCount: prepared.rowCount, dispose: prepared.dispose,
      complete: () => new PreparedNumberedNotationScore(document, options, timings, undefined, undefined, true, prepared.complete()) }
  }
  readonly pageCount: number
  readonly systemCount: number
  readonly quality: ReturnType<typeof numberedLayoutQuality>
  readonly width: number
  readonly minimumCoreGap: number
  constructor(document: ScoreDocument, options: Omit<NativeRenderOptions, 'paged' | 'coreGap'>, timings?: Record<string, number>, minimumQuality?: number, maximumPageCount?:number, measurementOnly = false, preparedMeasurement?: ReturnType<typeof measureNativeLayout>) {
    this.document = document; this.options = { ...options }
    if (measurementOnly && options.numericLayout !== false) {
      const result = this.measurement = preparedMeasurement ?? measureNativeLayout(document, { numericLayout: true, ...options, paged: true }, timings, minimumQuality, maximumPageCount)
      this.pageCount = result.pageCount; this.systemCount = result.systemCount; this.quality = result.quality; this.width = result.width
      this.minimumCoreGap = scoreVerticalSpacing().minimum
      return
    }
    this.placedLayout = layoutNativeScore(document, { numericLayout: true, ...options, paged: true }, timings, minimumQuality, maximumPageCount)
    this.pageCount = this.layout.pages.length
    this.systemCount = this.layout.systems.length
    this.quality = nativeLayoutQuality(this.layout)
    this.width = this.layout.options.width
    this.minimumCoreGap = scoreVerticalSpacing().minimum
  }
  /** Detached logical geometry for cross-notation density diagnostics. */
  layoutInfo() {
    const blocks = this.layout.verticalBlocks.slice(this.layout.headerBlocks.length)
    const events = new Set(this.layout.projection.glyphs.map(glyph => glyph.id.replace(/-(?:sustain|rest)\d+$/, '')))
    return { displayedEvents: events.size, hasBass: this.layout.projection.hasBass, spacing: this.layout.options.minimumNoteGap,
      measureRows: this.layout.systems.map(system => system.measures.map(measure => measure.id)),
      lines: blocks.map((block, index) => ({ core: block.core ? { ...block.core } : undefined,
        rhythmicGaps: [...(this.layout.systems[index]?.rhythmicGaps ?? [])],
        inkHeight: block.height, lyricGapScale: block.coreGapScale ?? 1 })) }
  }
  continuousHeight(coreGap = this.minimumCoreGap) {
    const heights = this.measurement
      ? this.measurement.pagination({ pageHeight: Infinity, margin: this.measurement.margin, gap: coreGap, vertical: scoreVerticalSpacing(), headerGap: nativeHeaderGap(coreGap), headerGapRatio: 2 / 3 }).heights
      : nativeContinuousPagination(this.layout, coreGap).heights
    return Math.ceil(nativeSvgNumber(heights[0] ?? 0))
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

/** Shared-page fitting is common to both notation adapters. */
export function renderSharedPreparedNumberedNotationScores(scores: readonly PreparedNumberedNotationScore[]) {
  if (scores.length < 2) throw new Error('A shared page needs at least two scores')
  const width = scores[0]!.width
  if (scores.some(score => score.width !== width)) throw new Error('合页曲目必须使用相同版宽。')
  const spacing = scoreVerticalSpacing()
  const fitted = fitSharedScorePage(scores.map(score=>gap=>score.continuousHeight(gap)),Math.floor(width*A4_CONTENT_ASPECT_RATIO),spacing)
  return {...fitted,markup:scores.map(score=>score.renderContinuous(fitted.coreGap)[0]!)}
}

/** Whole scores share a logical width and a single page-wide N. */
export function renderSharedNumberedNotationScores(documents: readonly ScoreDocument[], options: Omit<NativeRenderOptions, 'paged' | 'coreGap'>) {
  return renderSharedPreparedNumberedNotationScores(documents.map(document=>new PreparedNumberedNotationScore(document,options)))
}
