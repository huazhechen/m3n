import { m3nPitch, parseM3NDocument, type DirectEvent } from './m3n-direct'

export type MelodyComplexityMetrics = {
  noteCount: number
  notesPerBeat: number
  pitchRange: number
  rhythmicValues: number
  shortestDuration: number
  largeLeapRatio: number
  directionChangeRatio: number
  accidentalCount: number
  ornamentCount: number
}

export type MelodyComplexityAssessment = {
  score: number
  label: '基础' | '初级' | '中级' | '进阶' | '高难'
  metrics: MelodyComplexityMetrics
}

type MelodyPoint = {
  midi: number
  duration: number
  accidental: boolean
  ornamentCount: number
}

const chromaticPitch: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
const accidentalOffset: Record<string, number> = { s: 1, f: -1, ss: 2, x: 2, ff: -2, n: 0 }

function clamp(value: number) {
  return Math.max(0, Math.min(1, value))
}

function round(value: number, decimals = 2) {
  const multiplier = 10 ** decimals
  return Math.round(value * multiplier) / multiplier
}

function eventPoints(event: DirectEvent): MelodyPoint[] {
  if (event.kind === 'rest' || event.pitches.length === 0) return []
  const pitches = event.kind === 'tuplet' ? event.pitches : [event.pitches[0] ?? '']
  const duration = event.kind === 'tuplet' && event.tuplet
    ? event.tuplet.unitBeats * event.tuplet.numbase / event.tuplet.num
    : event.beats

  return pitches.map((value) => {
    const pitch = m3nPitch(value, event.key)
    const midi = (pitch.oct + event.octaveShift + 1) * 12
      + (chromaticPitch[pitch.pname] ?? 0)
      + (accidentalOffset[pitch.accidGes ?? ''] ?? 0)
    return {
      midi,
      duration,
      accidental: /[#b=]/.test(value),
      ornamentCount: event.postfixes.length,
    }
  })
}

function melodyEvents(source: string) {
  const document = parseM3NDocument(source)
  const names = document.partOrder.length > 0 ? document.partOrder : [...document.parts.keys()]
  return names.flatMap((name) => document.parts.get(name)?.melody.flatMap((measure) => measure.events) ?? [])
}

function scoreLabel(score: number): MelodyComplexityAssessment['label'] {
  if (score < 1.8) return '基础'
  if (score < 2.6) return '初级'
  if (score < 3.5) return '中级'
  if (score < 4.3) return '进阶'
  return '高难'
}

/** Scores the written treble melody only; the optional {bass} block is excluded. */
export function assessM3NMelodyComplexity(source: string): MelodyComplexityAssessment {
  const events = melodyEvents(source)
  const points = events.flatMap(eventPoints)
  const totalBeats = events.reduce((sum, event) => sum + event.beats, 0)
  const noteCount = points.length
  const notesPerBeat = totalBeats > 0 ? noteCount / totalBeats : 0
  const durations = new Set(points.map((point) => round(point.duration, 4)))
  const shortestDuration = points.reduce((shortest, point) => Math.min(shortest, point.duration), Infinity)
  const intervals = points.slice(1).map((point, index) => point.midi - (points[index]?.midi ?? point.midi))
  const nonRepeatedIntervals = intervals.filter((interval) => interval !== 0)
  const largeLeapRatio = intervals.length > 0
    ? intervals.filter((interval) => Math.abs(interval) >= 5).length / intervals.length : 0
  const directionChanges = nonRepeatedIntervals.slice(1).filter((interval, index) => {
    const previous = nonRepeatedIntervals[index] ?? interval
    return Math.sign(interval) !== Math.sign(previous)
  }).length
  const directionChangeRatio = nonRepeatedIntervals.length > 1 ? directionChanges / (nonRepeatedIntervals.length - 1) : 0
  const pitchRange = noteCount > 0 ? Math.max(...points.map((point) => point.midi)) - Math.min(...points.map((point) => point.midi)) : 0
  const accidentalCount = points.filter((point) => point.accidental).length
  const ornamentCount = points.reduce((sum, point) => sum + point.ornamentCount, 0)

  const density = clamp((notesPerBeat - 1) / 3)
  const rhythm = clamp((durations.size - 1) / 3) * 0.55 + clamp((1 - shortestDuration) / 0.75) * 0.3
    + (events.some((event) => event.kind === 'tuplet') ? 0.15 : 0)
  const contour = clamp(largeLeapRatio / 0.35) * 0.65 + clamp(directionChangeRatio / 0.65) * 0.35
  const pitch = clamp((pitchRange - 5) / 19)
  const accidentals = clamp(accidentalCount / Math.max(1, noteCount * 0.2))
  const ornaments = clamp(ornamentCount / Math.max(1, noteCount * 0.15))
  const score = round(Math.min(5, 1 + density * 1.05 + rhythm * 0.85 + contour * 0.8 + pitch * 0.6 + accidentals * 0.4 + ornaments * 0.3), 1)

  return {
    score,
    label: scoreLabel(score),
    metrics: {
      noteCount,
      notesPerBeat: round(notesPerBeat),
      pitchRange,
      rhythmicValues: durations.size,
      shortestDuration: Number.isFinite(shortestDuration) ? round(shortestDuration) : 0,
      largeLeapRatio: round(largeLeapRatio),
      directionChangeRatio: round(directionChangeRatio),
      accidentalCount,
      ornamentCount,
    },
  }
}
