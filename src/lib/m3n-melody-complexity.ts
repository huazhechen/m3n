import { m3nPitch } from './m3n-direct'
import type { ScoreDocument, ScoreEvent } from './notation/score-document'

export type MelodyComplexityMetrics = {
  noteCount: number
  notesPerBeat: number
  notesPerSecond: number
  peakNotesPerBeat: number
  pitchRange: number
  rhythmicValues: number
  shortestDuration: number
  largeLeapRatio: number
  maximumLeap: number
  directionChangeRatio: number
  offbeatRatio: number
  accidentalCount: number
  ornamentCount: number
  chordCount: number
  tieCount: number
  tupletCount: number
}

export type MelodyComplexityAssessment = {
  score: number
  label: '基础' | '初级' | '中级' | '进阶' | '高难'
  metrics: MelodyComplexityMetrics
}

type MelodyPoint = {
  midi: number
  start: number
  duration: number
  tempo: number
  accidental: boolean
  ornamentCount: number
  tie: boolean
  chord: boolean
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

function midiPitch(value: string, event: ScoreEvent) {
  const pitch = m3nPitch(value, event.key)
  return (pitch.oct + event.octaveShift + 1) * 12
    + (chromaticPitch[pitch.pname] ?? 0)
    + (accidentalOffset[pitch.accidGes ?? ''] ?? 0)
}

function eventPoints(event: ScoreEvent, start: number): MelodyPoint[] {
  if (event.kind === 'rest' || event.pitches.length === 0) return []
  const duration = event.kind === 'tuplet' && event.tuplet
    ? event.tuplet.unitBeats * event.tuplet.numbase / event.tuplet.num
    : event.beats
  const pitches = event.kind === 'tuplet'
    ? event.pitches
    : [event.pitches.reduce((highest, pitch) => midiPitch(pitch, event) > midiPitch(highest, event) ? pitch : highest)]

  return pitches.map((value, index) => ({
    midi: midiPitch(value, event),
    start: start + index * duration,
    duration,
    tempo: event.tempo ?? 120,
    accidental: /[#b=]/.test(value),
    ornamentCount: event.postfixes.length,
    tie: event.tie,
    chord: event.kind === 'chord',
  }))
}

function melodyEvents(document: ScoreDocument) {
  return [...document.parts.values()].flatMap((part) => part.melody.flatMap((measure) => measure.events))
}

function scoreLabel(score: number): MelodyComplexityAssessment['label'] {
  if (score < 1.8) return '基础'
  if (score < 2.6) return '初级'
  if (score < 3.5) return '中级'
  if (score < 4.3) return '进阶'
  return '高难'
}

function peakDensity(points: readonly MelodyPoint[]) {
  return points.reduce((peak, point, index) => {
    let count = 0
    for (let candidate = index; candidate < points.length; candidate += 1) {
      const candidatePoint = points[candidate]
      if (!candidatePoint || candidatePoint.start >= point.start + 1) break
      count += 1
    }
    return Math.max(peak, count)
  }, 0)
}

/** Scores a previously parsed document without repeating syntax analysis. */
export function assessM3NDocumentMelodyComplexity(document: ScoreDocument): MelodyComplexityAssessment {
  const events = melodyEvents(document)
  let elapsedBeats = 0
  const points: MelodyPoint[] = []
  const melodicRuns: MelodyPoint[][] = []
  let run: MelodyPoint[] = []
  let chordCount = 0
  let tupletCount = 0
  for (const event of events) {
    const eventPointsAtTime = eventPoints(event, elapsedBeats)
    if (event.kind === 'chord') chordCount += 1
    if (event.kind === 'tuplet') tupletCount += 1
    if (eventPointsAtTime.length === 0) {
      if (run.length > 0) melodicRuns.push(run)
      run = []
    } else {
      points.push(...eventPointsAtTime)
      run.push(...eventPointsAtTime)
    }
    elapsedBeats += event.beats
  }
  if (run.length > 0) melodicRuns.push(run)

  const totalBeats = Math.max(0, elapsedBeats)
  const noteCount = points.length
  const notesPerBeat = totalBeats > 0 ? noteCount / totalBeats : 0
  const weightedTempo = points.length > 0 ? points.reduce((sum, point) => sum + point.tempo, 0) / points.length : 120
  const notesPerSecond = notesPerBeat * weightedTempo / 60
  const durations = new Set(points.map((point) => round(point.duration, 4)))
  const shortestDuration = points.reduce((shortest, point) => Math.min(shortest, point.duration), Infinity)
  const intervals = melodicRuns.flatMap((pointsInRun) => pointsInRun.slice(1).flatMap((point, index) => {
    const previous = pointsInRun[index]
    return previous ? [point.midi - previous.midi] : []
  }))
  const nonRepeatedIntervals = intervals.filter((interval) => interval !== 0)
  const largeLeapRatio = intervals.length > 0
    ? intervals.filter((interval) => Math.abs(interval) >= 5).length / intervals.length : 0
  const maximumLeap = Math.max(0, ...intervals.map((interval) => Math.abs(interval)))
  const directionChanges = nonRepeatedIntervals.slice(1).filter((interval, index) => {
    const previous = nonRepeatedIntervals[index]
    return previous !== undefined && Math.sign(interval) !== Math.sign(previous)
  }).length
  const directionChangeRatio = nonRepeatedIntervals.length > 1 ? directionChanges / (nonRepeatedIntervals.length - 1) : 0
  const pitchRange = noteCount > 0 ? Math.max(...points.map((point) => point.midi)) - Math.min(...points.map((point) => point.midi)) : 0
  const accidentalCount = points.filter((point) => point.accidental).length
  const ornamentCount = points.reduce((sum, point) => sum + point.ornamentCount, 0)
  const tieCount = points.filter((point) => point.tie).length
  const offbeatRatio = points.length > 0
    ? points.filter((point) => Math.abs(point.start - Math.round(point.start)) > 1e-9).length / points.length : 0
  const peakNotesPerBeat = peakDensity(points)

  const speed = clamp((notesPerSecond - 1.4) / 3.2) * 0.65 + clamp((peakNotesPerBeat - 2) / 4) * 0.35
  const rhythm = clamp((durations.size - 1) / 4) * 0.35 + clamp((1 - shortestDuration) / 0.875) * 0.35
    + clamp(tupletCount / Math.max(1, noteCount * 0.08)) * 0.2 + clamp(offbeatRatio / 0.55) * 0.1
  const contour = clamp(largeLeapRatio / 0.3) * 0.45 + clamp((maximumLeap - 4) / 14) * 0.35
    + clamp(directionChangeRatio / 0.6) * 0.2
  const range = clamp((pitchRange - 7) / 24)
  const notation = clamp(accidentalCount / Math.max(1, noteCount * 0.12)) * 0.45
    + clamp(ornamentCount / Math.max(1, noteCount * 0.1)) * 0.3
    + clamp(chordCount / Math.max(1, noteCount * 0.12)) * 0.15
    + clamp(tieCount / Math.max(1, noteCount * 0.2)) * 0.1
  const score = round(Math.min(5, 1 + speed * 1.05 + rhythm * 1 + contour * 1.05 + range * 0.6 + notation * 0.45), 1)

  return {
    score,
    label: scoreLabel(score),
    metrics: {
      noteCount,
      notesPerBeat: round(notesPerBeat),
      notesPerSecond: round(notesPerSecond),
      peakNotesPerBeat,
      pitchRange,
      rhythmicValues: durations.size,
      shortestDuration: Number.isFinite(shortestDuration) ? round(shortestDuration) : 0,
      largeLeapRatio: round(largeLeapRatio),
      maximumLeap,
      directionChangeRatio: round(directionChangeRatio),
      offbeatRatio: round(offbeatRatio),
      accidentalCount,
      ornamentCount,
      chordCount,
      tieCount,
      tupletCount,
    },
  }
}
