import type { ScoreDocument } from '@m3n/notation'
import { prepareNativeRelations } from './native-layout.js'
import { projectNativeScore } from './native-model.js'
import { nativeHorizontalSpacing } from './native-horizontal.js'
import { CanvasTextMeasurer, DefaultTextMeasurer, NumberedTextMeasurementCache, type TextMeasurer } from './native-measure.js'

/** A logical measure or a time slice of it, independent of painted notation. */
export type ScoreHorizontalSpan = { id: string; start?: number; end?: number }

/** Reuse the same rhythmic/lyric/bar constraint chain that numbered notation
 * measures. Other notations add their own physical collision minima. This
 * prepares no lines, pages or SVG output, and never copies another layout. */
export function createScoreHorizontalReference(score: ScoreDocument, options: {
  includeBass?: boolean; transpose?: number; tempoScale?: number; textMeasurer?: TextMeasurer
} = {}) {
  const cache = new NumberedTextMeasurementCache()
  cache.synchronizeFonts()
  const context = typeof document === 'undefined' || typeof CanvasRenderingContext2D === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  const measurer = options.textMeasurer ?? (context ? new CanvasTextMeasurer(context, undefined, cache) : new DefaultTextMeasurer())
  const projection = projectNativeScore(score, { ...options, textMeasurer: measurer })
  prepareNativeRelations(score, projection)
  const measures = new Map(projection.measures.map(measure => [measure.id, measure]))
  const widths = new Map<string, number>()
  return (spans: readonly ScoreHorizontalSpan[], gap: number, equal: boolean): number | undefined => {
    const key = `${gap}:${equal}:${spans.map(span => `${span.id}:${span.start ?? 0}:${span.end ?? ''}`).join(',')}`
    const saved = widths.get(key)
    if (saved !== undefined) return saved
    const members = []
    for (const span of spans) {
      const source = measures.get(span.id)
      if (!source) return undefined
      const start = span.start ?? 0, end = span.end ?? source.beats
      members.push(start === 0 && end >= source.beats ? source : {
        ...source, continuation: start > 0, lastFragment: end >= source.beats,
        columns: source.columns.filter(column => column.time >= start - 1e-7 && column.time < end - 1e-7),
      })
    }
    const width = nativeHorizontalSpacing(members, { minimumNoteGap: gap, equalMeasures: equal }).minimumWidth
    widths.set(key, width)
    return width
  }
}
