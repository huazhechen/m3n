import type { PerformanceNote, ScorePerformance } from './performance.js'

export type GlissandoStyle = 'overlap' | 'soft' | 'short' | 'short-smooth' | 'short-level' | 'short-strong' | 'short-carry' | 'target-duration' | 'continuous'

/** Shape only explicitly marked transitions; source events and clocks stay intact. */
export function shapeGlissandi(performance: ScorePerformance, style: GlissandoStyle): PerformanceNote[] {
  const beatsFor = (milliseconds: number, beat: number) => {
    const qpm = performance.tempos.findLast(point => point.beat <= beat)?.qpm ?? 120
    return milliseconds * qpm / 60_000
  }
  return performance.notes.flatMap(note => {
    const points = note.pitchBends
    if (!points?.length || style === 'continuous') return [note]
    if (style === 'target-duration') {
      const bends = [points[0]!]
      for (let index = 1; index < points.length; index++) {
        const from = points[index - 1]!, to = points[index]!
        const end = to.duration === undefined ? points[index + 1]?.beat ?? note.end : to.beat + to.duration
        // Hold the principal through its own slot, then spend the entire
        // target slot sliding. Reach the target only when that slot ends.
        addSmoothBend(bends, { beat: to.beat, pitch: from.pitch }, { beat: end, pitch: to.pitch }, end - to.beat)
      }
      return [{ ...note, pitchBends: bends, transition: true }]
    }
    if (style === 'short-carry') {
      return points.map((point, index) => {
        const previous = points[index - 1], next = points[index + 1]
        const boundary = next?.beat ?? note.end
        const lead = previous ? Math.min(beatsFor(50, point.beat), (point.beat - previous.beat) / 3) : 0
        const fadeIn = previous ? Math.min(beatsFor(60, point.beat), (point.beat - previous.beat) / 3, (boundary - point.beat) / 3) : 0
        const fadeOut = next ? Math.min(beatsFor(60, boundary), (boundary - point.beat) / 3, ((points[index + 2]?.beat ?? note.end) - boundary) / 3) : 0
        const start = point.beat - lead, end = boundary + fadeOut
        const bends = [{ beat: start, pitch: point.pitch }]
        if (next) addSmoothBend(bends, point, next, Math.min(beatsFor(35, boundary), (boundary - point.beat) / 3))
        // Start the target sample silently before the join, so its transient
        // has passed by the time the already-bent source hands over to it.
        const expression = [{ beat: start, value: previous ? 0 : 127 }]
        if (previous) {
          expression.push({ beat: point.beat, value: 0 })
          for (let step = 1; step <= 16; step++) expression.push({ beat: point.beat + fadeIn * step / 16,
            value: Math.round(127 * Math.sqrt(Math.sin(Math.PI / 2 * step / 16))) })
        }
        if (next) {
          expression.push({ beat: boundary, value: 127 })
          for (let step = 1; step <= 16; step++) expression.push({ beat: boundary + fadeOut * step / 16,
            value: Math.round(127 * Math.sqrt(Math.max(0, Math.cos(Math.PI / 2 * step / 16)))) })
        }
        return { ...note, start, end, pitch: point.pitch, pitchBends: bends, expression, transition: true }
      })
    }
    if (style === 'short-smooth' || style === 'short-level' || style === 'short-strong') {
      const bends = [points[0]!]
      const volume = [{ beat: note.start, value: 100 }]
      for (let index = 1; index < points.length; index++) {
        const from = points[index - 1]!, to = points[index]!
        const duration = Math.min(beatsFor(35, to.beat), (to.beat - from.beat) / 3)
        addSmoothBend(bends, from, to, duration)
        // Compensate only the actual bend, with short shoulders on either
        // side. Both surrounding sustained pitches retain their original level.
        if (style !== 'short-smooth') {
          const edge = Math.min(beatsFor(8, to.beat), duration / 3, ((points[index + 1]?.beat ?? note.end) - to.beat) / 3)
          const peak = style === 'short-strong' ? 127 : 118
          volume.push({ beat: to.beat - duration - edge, value: 100 }, { beat: to.beat - duration, value: peak },
            { beat: to.beat, value: peak }, { beat: to.beat + edge, value: 100 })
        }
      }
      return [{ ...note, pitchBends: bends, ...(style !== 'short-smooth' ? { volume } : {}), transition: true }]
    }
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

/** Sample a smoothstep curve densely, including a hold before the actual bend. */
function addSmoothBend(bends: Array<{ beat: number; pitch: number }>, from: { beat: number; pitch: number }, to: { beat: number; pitch: number }, duration: number) {
  bends.push({ beat: to.beat - duration, pitch: from.pitch })
  for (let step = 1; step <= 12; step++) {
    const t = step / 12, eased = t * t * (3 - 2 * t)
    bends.push({ beat: to.beat - duration + duration * t, pitch: from.pitch + (to.pitch - from.pitch) * eased })
  }
}
