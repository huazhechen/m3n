import type { ScoreDocument } from '@m3n/notation'
import type { NativeLayoutTask } from './native-layout.js'
import type { NativeGlyph, NativeMeasure, NativeProjection } from './native-model.js'
import type { NativeRelationLayout } from './native-relations.js'
import type { TextMeasurer, NumberedTextMeasurementCache } from './native-measure.js'
import type { prepareScorePagination, ScorePageBlock } from './layout/pagination.js'

export type NativeRenderOptions = {
  systemCjk?: boolean
  fixedDo?: boolean; transpose?: number; tempoScale?: number
  paged: boolean; width: number; measureNumbers?: boolean; includeBass?: boolean; textMeasurer?: TextMeasurer
  textMeasurementCache?: NumberedTextMeasurementCache
  layoutTask?: NativeLayoutTask
  pageMargin?: number; coreGap?: number
  /** Experimental measured-page ceiling; off until its interactive cost is acceptable. */
  pageConstrainedBreaks?: boolean
  numericLayout?: boolean
  /** Allows uncached parity measurements of the experimental solver. */
  cachePageLineGeometry?: boolean
  minimumNoteGap?: number; minimumNoteGapFloor?: number
  equalMeasures?: boolean; wrapWidthRatio?: number
}
export type NativeRelation = { kind: 'tie' | 'slur' | 'cresc' | 'decres' | 'inst' | 'tuplet'; first: NativeGlyph; last: NativeGlyph; label?: string; level: number }
export type NativeLane = { id: string; y: number; top: number; bottom: number; bodyBottom?: number; lyricBottom?: number; rows: number[] }
export type NativeSystem = { horizontalDensity?: number; unitRhythmicGap?: number; rhythmicGaps?: readonly number[]; coreGap?: number; index: number; numericGeometry?: boolean; measures: NativeMeasure[]; lanes: NativeLane[]; top: number; bottom: number; page: number; volta: boolean; relations: NativeRelation[]; arcContinuationLeft?: number; decorationLayout?: { lane: string; svg: string; hidden?: boolean; measureNumber?: boolean }[]; relationLayout?: Map<NativeRelation, NativeRelationLayout>; voltas?: { left: number; right: number; ending: string; top: number; svg: string }[] }
export type NativePage = { coreGap?: number; header?: string; index: number; width: number; height: number; systems: NativeSystem[] }
export type NativeLayout = {
  document: ScoreDocument; headerDocument: ScoreDocument; projection: NativeProjection; systems: NativeSystem[]; pages: NativePage[]; relations: NativeRelation[]
  options: NativeRenderOptions; measurer: TextMeasurer; headerHeight: number; margin: number
  pagination: ReturnType<typeof prepareScorePagination>; verticalBlocks: ScorePageBlock[]; headerBlocks: { height: number; svg: string }[]
}

