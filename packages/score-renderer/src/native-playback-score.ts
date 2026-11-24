import { compileScorePerformance, type ScoreDocument } from '@m3n/notation'
import { MIDI_PPQ, performanceTick, writePerformanceMidi } from './midi-writer.js'

export type TimedScoreElement = { xmlId: string; rendition: number; tupletSlot?: number; orderIndex?: number }

/** MIDI generation and source timing share the exact same quantized clock. */
export class NativePlaybackScore {
  private readonly performance
  private readonly spans: Array<TimedScoreElement & { start: number; end: number }>
  private readonly voices = new Map<string, Array<TimedScoreElement & { start: number; end: number }>>()
  private readonly starts = new Map<string, number>()
  private midiData?: ArrayBuffer
  private readonly resumeSpans: Array<{ start: number; end: number; sounding: boolean }>
  private readonly duration: number
  private destroyed = false

  private constructor(document: ScoreDocument) {
    this.performance = compileScorePerformance(document)
    const points: Array<{ tick: number; milliseconds: number; micros: number }> = []
    let tick = 0, milliseconds = 0, micros = 500_000
    for (const tempo of this.performance.tempos) {
      const nextTick = performanceTick(tempo.beat)
      milliseconds += (nextTick - tick) * micros / (1000 * MIDI_PPQ)
      tick = nextTick; micros = Math.round(60_000_000 / tempo.qpm)
      points.push({ tick, milliseconds, micros })
    }
    const time = (beat: number) => {
      const tick = performanceTick(beat)
      let low = 0, high = points.length
      while (low < high) { const mid = (low + high) >>> 1; if (points[mid]!.tick <= tick) low = mid + 1; else high = mid }
      const point = points[Math.max(0, low - 1)]!
      return point.milliseconds + (tick - point.tick) * point.micros / (1000 * MIDI_PPQ)
    }
    this.spans = this.performance.elements.map(element => ({ ...element, start: time(element.start), end: time(element.end) }))
    this.duration = time(this.performance.beats)
    const melodyNotes = this.performance.notes.filter(note => note.channel === 0)
    this.resumeSpans = this.performance.elements.filter(element => element.voice.endsWith(':melody')).map(element => {
      const notes = melodyNotes.filter(note => note.start < element.end && note.end > element.start)
      return { start: time(element.start), end: time(Math.max(element.end, ...notes.map(note => note.end))), sounding: notes.length > 0 }
    })
    for (const [index, element] of this.performance.elements.entries()) {
      const spans = this.voices.get(element.voice) ?? []
      spans.push(this.spans[index]!); this.voices.set(element.voice, spans)
    }
    for (const span of this.spans) {
      const id = `${span.xmlId}${span.rendition > 1 ? `-rend${span.rendition}` : ''}`
      if (!this.starts.has(id)) this.starts.set(id, span.start)
      if (!this.starts.has(span.xmlId)) this.starts.set(span.xmlId, span.start)
    }
  }

  static async create(document: ScoreDocument) { return new NativePlaybackScore(document) }

  midi() {
    this.check()
    this.midiData ??= writePerformanceMidi(this.performance)
    return this.midiData.slice(0)
  }

  elementsAtTime(milliseconds: number): TimedScoreElement[] {
    this.check()
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return []
    const active: Array<TimedScoreElement & { start: number }> = []
    for (const spans of this.voices.values()) {
      let low = 0, high = spans.length
      while (low < high) { const mid = (low + high) >>> 1; if (spans[mid]!.start <= milliseconds) low = mid + 1; else high = mid }
      const span = spans[low - 1]
      if (span && span.end > milliseconds) active.push(span)
    }
    return active.sort((a, b) => a.start - b.start).map(({ xmlId, rendition, tupletSlot, orderIndex }) => ({ xmlId, rendition,
      ...(tupletSlot === undefined ? {} : { tupletSlot }),
      ...(orderIndex === undefined ? {} : { orderIndex }) }))
  }

  /** Next written melody event at or after the transport position, preserving repeats. */
  nextElementAtTime(milliseconds: number): TimedScoreElement | undefined {
    this.check()
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return undefined
    let next: (TimedScoreElement & { start: number }) | undefined
    for (const [voice, spans] of this.voices) {
      if (!voice.endsWith(':melody')) continue
      let low = 0, high = spans.length
      while (low < high) { const mid = (low + high) >>> 1; if (spans[mid]!.start < milliseconds) low = mid + 1; else high = mid }
      const candidate = spans[low]
      if (candidate && (!next || candidate.start < next.start)) next = candidate
    }
    if (!next) return undefined
    const { xmlId, rendition, tupletSlot, orderIndex } = next
    return { xmlId, rendition, ...(tupletSlot === undefined ? {} : { tupletSlot }), ...(orderIndex === undefined ? {} : { orderIndex }) }
  }

  timeForElement(xmlId: string) { this.check(); return this.starts.get(xmlId) ?? -1 }

  /** Skip the interrupted melody event, including tied continuations; keep rests. */
  resumeTimeAt(milliseconds: number) {
    this.check()
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds >= this.duration) return 0
    const active = this.resumeSpans.find(span => span.start <= milliseconds && span.end > milliseconds)
    if (!active?.sounding || milliseconds === active.start) return milliseconds
    return active.end >= this.duration ? 0 : active.end
  }

  destroy() { this.destroyed = true; this.midiData = undefined; this.starts.clear(); this.voices.clear(); this.spans.length = 0 }
  private check() { if (this.destroyed) throw new Error('播放乐谱已释放。') }
}

export { NativePlaybackScore as PlaybackScore }
