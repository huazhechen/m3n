import type { PerformanceNote, ScorePerformance } from './performance.js'

export type GlissandoStyle = 'overlap' | 'soft' | 'short' | 'continuous'

/** Shape only explicitly marked transitions; source events and clocks stay intact. */
export function shapeGlissandi(performance: ScorePerformance, style: GlissandoStyle): PerformanceNote[] {
  const beatsFor = (milliseconds: number, beat: number) => {
    const qpm = performance.tempos.findLast(point => point.beat <= beat)?.qpm ?? 120
    return milliseconds * qpm / 60_000
  }
  return performance.notes.flatMap(note => {
    const points = note.pitchBends
    if (!points?.length || style === 'continuous') return [note]
    if (style === 'short') {
      const bends = [points[0]!]
      for (let index = 1; index < points.length; index++) {
        const from = points[index - 1]!, to = points[index]!
        const duration = Math.min(beatsFor(35, to.beat), (to.beat - from.beat) / 3)
        bends.push({ beat: to.beat - duration, pitch: from.pitch }, to)
      }
      return [{ ...note, pitchBends: bends }]
    }
    return points.map((point, index) => {
      const next = points[index + 1]
      const boundary = next?.beat ?? note.end
      const overlap = next ? Math.min(beatsFor(35, boundary), (boundary - point.beat) / 3, ((points[index + 2]?.beat ?? note.end) - boundary) / 3) : 0
      const { pitchBends: _, ...plain } = note
      const segment: PerformanceNote = { ...plain, start: point.beat, end: boundary + overlap, pitch: point.pitch }
      if (style === 'soft') {
        segment.expression = []
        if (index > 0) {
          const previous = points[index - 1]!
          const fade = Math.min(beatsFor(35, point.beat), (point.beat - previous.beat) / 3, (boundary - point.beat) / 3)
          segment.expression.push({ beat: point.beat, value: 0 }, { beat: point.beat + fade, value: 127 })
        } else segment.expression.push({ beat: point.beat, value: 127 })
        if (next) segment.expression.push({ beat: boundary, value: 127 }, { beat: boundary + overlap, value: 0 })
      }
      // Reuse the existing allocator for every segment, including plain overlaps.
      segment.transition = true
      return segment
    })
  })
}
