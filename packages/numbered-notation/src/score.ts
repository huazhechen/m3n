import { CanvasTextMeasurer, compileScore, ErrorDiagnostic, type TextMeasurer } from '@m3n/jpfun'
import { validateScoreDocument, type ScoreDocument } from '@m3n/notation'
import { projectNumberedScore, type NumberedNotationDiagnostic } from './projection.js'
import { numberedRowEndMeasures, renderInteractivePages } from './svg.js'

export type NumberedNotationRenderOptions = {
  paged: boolean
  width: number
  /** Display absolute pitches as C-based numbered notation with sharps. */
  fixedDo?: boolean
  /** Semitone shift for displayed keys or fixed-C pitches; leaves the source document intact. */
  transpose?: number
  /** Display tempo marks at this ratio to the original score tempo. */
  tempoScale?: number
  measureNumbers?: boolean
  includeBass?: boolean
  textMeasurer?: TextMeasurer
  pageMargin?: number
  systemGap?: number
  /** Natural note clearance as a fraction of the 22px music size (default 0.5); lyrics and justification may enlarge it. */
  noteGapEm?: number
  /** Minimum clearance for testing line capacity (default 0.3 when natural spacing is omitted), using the same spacing ratios. */
  minimumNoteGapEm?: number
  /** Absolute minimum after duration and beam scaling (default 0.1em). */
  minimumNoteGapFloorEm?: number
  /** Fixed music spacing within each paragraph; headings and lyrics stay local. */
  uniformSystemHeight?: boolean
  /** Override the document's equal-measure layout setting. */
  equalMeasures?: boolean
  /** Pack natural-width measures more closely; equal-measure exercises only tighten sparse long notes. */
  wrap?: 'normal' | 'compact'
  /** Choose breaks at this fraction of the available width without scaling music. */
  wrapWidthRatio?: number
}

/** Pure frontend jpFun adapter; ScoreDocument is the only musical input. */
export class NumberedNotationScore {
  diagnostics: NumberedNotationDiagnostic[] = []
  private constructor(private readonly document: ScoreDocument) {}
  static create(document: ScoreDocument) { return new NumberedNotationScore(document) }

  render(options: NumberedNotationRenderOptions): string[] {
    if (options.tempoScale !== undefined && (!Number.isFinite(options.tempoScale) || options.tempoScale <= 0)) throw new Error('显示速度倍率必须为正有限数值。')
    if (options.transpose !== undefined && !Number.isInteger(options.transpose)) throw new Error('谱面移调必须为整数半音数。')
    // All application layouts share the same minimum/natural spacing policy.
    const minimumNoteGapEm = options.minimumNoteGapEm ?? (options.noteGapEm === undefined ? 0.3 : undefined)
    options = { ...options, noteGapEm: options.noteGapEm ?? 0.5, minimumNoteGapEm,
      minimumNoteGapFloorEm: options.minimumNoteGapFloorEm ?? Math.min(0.1, minimumNoteGapEm ?? 0) }
    if (!Number.isFinite(options.width)) throw new Error('简谱宽度必须为有限数值。')
    for (const value of [options.pageMargin, options.systemGap]) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error('简谱页边距和行距必须为非负有限数值。')
    }
    if (options.noteGapEm !== undefined && (!Number.isFinite(options.noteGapEm) || options.noteGapEm < 0)) throw new Error('音符间距比例必须为非负有限数值。')
    if (options.minimumNoteGapEm !== undefined && (!Number.isFinite(options.minimumNoteGapEm) || options.minimumNoteGapEm < 0 || options.noteGapEm === undefined || options.minimumNoteGapEm > options.noteGapEm)) throw new Error('最小间距必须非负且不大于自然间距。')
    if (!Number.isFinite(options.minimumNoteGapFloorEm) || options.minimumNoteGapFloorEm! < 0 || options.minimumNoteGapFloorEm! > (options.minimumNoteGapEm ?? 0)) throw new Error('最小间距下限必须非负且不大于最小基础间距。')
    const canvas = typeof document === 'undefined' || typeof CanvasRenderingContext2D === 'undefined' ? null : document.createElement('canvas')
    const context = canvas?.getContext('2d')
    const textMeasurer = options.textMeasurer ?? (context ? new CanvasTextMeasurer(context) : undefined)
    const projectionOptions = { ...options, textMeasurer, width: Math.max(320, Math.round(options.width)) }
    let projection = projectNumberedScore(this.document, { ...projectionOptions, measureNumbers: options.measureNumbers ? false : options.measureNumbers })
    const compile = (source: string, resolvedLineStarts?: readonly string[]) => compileScore(source, { systemSpacing: { coreGap: options.systemGap ?? 24, inkGap: (options.systemGap ?? 24) / 2 }, autoWrap: true, resolvedLineStarts, minimumNoteGapFloor: options.minimumNoteGapEm === undefined ? undefined : 22 * options.minimumNoteGapFloorEm!, minimumNoteGap: options.minimumNoteGapEm === undefined ? undefined : 22 * options.minimumNoteGapEm, noteGap: options.noteGapEm === undefined ? undefined : 22 * options.noteGapEm, wrap: options.wrap, wrapWidthRatio: options.wrapWidthRatio, alignRelations: true, uniformSystemHeight: options.uniformSystemHeight, equalMeasures: options.equalMeasures ?? this.document.equalMeasures, textMeasurer })
    let result = compile(projection.source)
    if (options.measureNumbers) {
      // Hidden interior numbers must never become layout obstacles. Horizontal
      // bar widths do not depend on their zero-time overhanging labels.
      const numberedMeasures = numberedRowEndMeasures(result, projection)
      const rowStarts = new Map<number, typeof result.layout.objects[number]>()
      for (const node of result.layout.objects) if (!node.T.isZero()) {
        const first = rowStarts.get(node.layoutLine)
        if (!first || node.t.compare(first.t) < 0) rowStarts.set(node.layoutLine, node)
      }
      projection = projectNumberedScore(this.document, { ...projectionOptions, numberedMeasures })
      result = compile(projection.source, [...rowStarts.values()].map(node => node.t.toString()))
    }
    // The score model understands complementary pickups and alternate endings;
    // jpFun sees independent bars and otherwise reports these valid fragments.
    const hasMeterWarning = result.diagnostics.some(item => item.code === 'W_METER_MISMATCH')
    const validMeter = hasMeterWarning && !validateScoreDocument(this.document)
      .some(item => item.code.startsWith('M3N_METER_'))
    const diagnostics = result.diagnostics.filter(item => !(validMeter && item.code === 'W_METER_MISMATCH'))
    this.diagnostics = [...projection.diagnostics, ...diagnostics.map(item => ({ code: item.code, message: item.message, severity: item instanceof ErrorDiagnostic ? 'error' as const : 'warning' as const }))]
    const error = this.diagnostics.find(item => item.severity === 'error')
    if (error) throw new Error(`简谱排版失败：${error.message}`)
    return renderInteractivePages(result, projection)
  }
}
