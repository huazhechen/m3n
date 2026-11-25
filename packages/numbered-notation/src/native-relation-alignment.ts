import type { NativeRelation } from './native-layout.js'
import type { NativeGlyph, NativeProjection } from './native-model.js'

/** Form semantic arc chains before wrapping. Width and pagination must never
 * decide which phrases belong together; nested layers remain independent. */
export function alignNativeArcs(relations: NativeRelation[], projection: NativeProjection): void {
  const lanes = new Map<string, { glyph: NativeGlyph; time: number }[]>()
  const offsets = new Map<number, number>()
  for (const measure of projection.measures) {
    const offset = offsets.get(measure.part) ?? 0
    for (const column of measure.columns) for (const glyph of column.glyphs) {
      const key = `${measure.part}:${glyph.lane}`
      const lane = lanes.get(key) ?? []
      lane.push({ glyph, time: offset + glyph.time }); lanes.set(key, lane)
    }
    offsets.set(measure.part, offset + measure.beats)
  }
  let group = 0
  for (const glyphs of lanes.values()) {
    const positions = new Map(glyphs.map(({ glyph, time }) => [glyph, time]))
    const spans = relations.flatMap(relation => {
      if (relation.kind !== 'tie' && relation.kind !== 'slur') return []
      const start = positions.get(relation.first), end = positions.get(relation.last)
      return start === undefined || end === undefined ? [] : [{ relation, start, end }]
    })
    const levels = new Map<string, typeof spans>()
    for (const span of spans) {
      const depth = spans.filter(other => other.start <= span.start && other.end >= span.end
        && (other.start < span.start || other.end > span.end)).length
      const key = `${span.relation.kind}:${depth}`
      const siblings = levels.get(key) ?? []
      siblings.push(span); levels.set(key, siblings)
    }
    for (const siblings of levels.values()) {
      siblings.sort((a, b) => a.start - b.start)
      let previous: typeof spans[number] | undefined
      for (const span of siblings) {
        const adjacent = previous && (Math.abs(previous.end - span.start) < 1e-9
          || Math.abs(previous.end + previous.relation.last.beats - span.start) < 1e-9)
        if (!adjacent) group++
        span.relation.arcGroup = group
        previous = span
      }
    }
  }
}
