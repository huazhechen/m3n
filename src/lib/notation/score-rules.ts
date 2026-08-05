import { createScoreDiagnostic, type ScoreDiagnostic } from './diagnostics'
import type { ScoreDocument, ScoreMeasure } from './score-document'
import { m3nPitch } from '../m3n-direct'

const EPSILON = 1e-9

function writtenMeasures(measures: readonly ScoreMeasure[]) {
  let count = measures.length
  while (count > 0) {
    const measure = measures[count - 1]
    if (measure && (measure.events.length > 0 || measure.multiRest)) break
    count -= 1
  }
  return measures.slice(0, count)
}

function measureBeats(measure: ScoreMeasure) {
  return measure.events.reduce((total, event) => total + event.beats, 0)
}

function measureRange(measure: ScoreMeasure | undefined) {
  if (!measure) return undefined
  const first = measure.events[0]
  const last = measure.events.at(-1)
  const start = first?.sourceStart ?? Math.max(0, (measure.barEnd ?? 0) - 1)
  const end = measure.barEnd !== undefined && measure.barEnd >= start
    ? measure.barEnd
    : last?.sourceEnd ?? start
  return { start, end }
}

function sourceLine(source: string | undefined, offset: number | undefined) {
  if (!source || offset === undefined) return undefined
  return source.slice(0, offset).split('\n').length
}

/** Semantic rules that only require the normalized score model. */
function measureExpectedBeats(document: ScoreDocument, measure: ScoreMeasure) {
  const event = measure.events[0]
  const count = event?.meterCount ?? document.meterCount
  const unit = event?.meterUnit ?? document.meterUnit
  return count * 4 / unit
}

function validateMeasureDurations(document: ScoreDocument, measures: readonly ScoreMeasure[], source?: string) {
  const diagnostics: ScoreDiagnostic[] = []
  if (measures.some((measure) => measure.multiRest)) return diagnostics
  const report = (code: string, message: string, measure: ScoreMeasure, messageArgs: Record<string, number>) => {
    const range = measureRange(measure)
    const line = sourceLine(source, range?.start)
    const located = line === undefined ? message : `第 ${line} 行，${message}`
    diagnostics.push(createScoreDiagnostic({
      code,
      message: located,
      range,
      messageArgs: line === undefined ? messageArgs : { ...messageArgs, line },
    }))
  }
  const values = measures.map((measure, index) => ({
    measure,
    index,
    actual: measureBeats(measure),
    expected: measureExpectedBeats(document, measure),
  }))
  const equal = (left: number, right: number) => Math.abs(left - right) <= EPSILON
  const complementary = new Set<number>()
  for (let index = 0; index < values.length - 1; index += 1) {
    const left = values[index]
    const right = values[index + 1]
    if (!left || !right || left.actual >= left.expected || right.actual >= right.expected) continue
    if (equal(left.expected, right.expected) && equal(left.actual + right.actual, left.expected)) {
      complementary.add(index)
      complementary.add(index + 1)
      index += 1
    }
  }
  for (const value of values) {
    if (value.actual > value.expected && !equal(value.actual, value.expected)) {
      report('M3N_METER_OVERFULL', `第 ${value.index + 1} 小节拍数超出：期望 ${value.expected} 拍，实际 ${value.actual} 拍`, value.measure,
        { measure: value.index + 1, expected: value.expected, actual: value.actual })
    }
  }
  if (values.length === 1) {
    const only = values[0]
    if (only && !equal(only.actual, only.expected)) {
      report('M3N_METER_INCOMPLETE_SINGLE', `第 1 小节：单个小节拍数必须满拍：期望 ${only.expected} 拍，实际 ${only.actual} 拍`, only.measure,
        { measure: 1, expected: only.expected, actual: only.actual })
    }
    return diagnostics
  }
  for (const value of values.slice(1, -1)) {
    if (complementary.has(value.index)) continue
    if (!equal(value.actual, value.expected)) {
      report('M3N_METER_INCOMPLETE_MIDDLE', `第 ${value.index + 1} 小节：中间小节拍数不合规：期望 ${value.expected} 拍，实际 ${value.actual} 拍`, value.measure,
        { measure: value.index + 1, expected: value.expected, actual: value.actual })
    }
  }
  const first = values[0]
  const last = values.at(-1)
  if (!first || !last) return diagnostics
  if (complementary.has(first.index) || complementary.has(last.index)) return diagnostics
  if (equal(first.actual, first.expected)) {
    if (!equal(last.actual, last.expected)) {
      report('M3N_METER_INCOMPLETE_FINAL', `第 ${last.index + 1} 小节：没有弱起时末小节拍数必须满拍：期望 ${last.expected} 拍，实际 ${last.actual} 拍`, last.measure,
        { measure: last.index + 1, expected: last.expected, actual: last.actual })
    }
  } else if (!equal(first.expected, last.expected) || !equal(first.actual + last.actual, first.expected)) {
    report('M3N_METER_PICKUP_MISMATCH', `首末小节拍数不互补：首 ${first.actual} 拍 + 末 ${last.actual} 拍，完整小节为 ${first.expected} 拍`, first.measure,
      { first: first.actual, last: last.actual, expected: first.expected })
  }
  return diagnostics
}

function absolutePitches(event: { pitches: string[]; key: string; octaveShift: number }) {
  return event.pitches.map((pitch) => {
    const value = m3nPitch(pitch, event.key)
    return `${value.pname}:${value.oct + event.octaveShift}:${value.accidGes ?? value.accid}`
  })
}

function validateTies(measures: readonly ScoreMeasure[], source?: string) {
  const diagnostics: ScoreDiagnostic[] = []
  const events = measures.flatMap((measure) => measure.events)
  for (const [index, event] of events.entries()) {
    if (!event.tie || event.kind === 'rest') continue
    const target = events[index + 1]
    const sourceKind = event.kind === 'tuplet' ? 'note' : event.kind
    const sourcePitches = event.kind === 'tuplet' ? event.pitches.slice(-1) : event.pitches
    const matches = target && target.kind === sourceKind
      && absolutePitches(target).join(',') === absolutePitches({ ...event, pitches: sourcePitches }).join(',')
    if (matches) continue
    const message = '延音目标的类型或绝对音高不匹配'
    const line = sourceLine(source, event.sourceStart)
    const located = line === undefined ? message : `第 ${line} 行：${message}`
    diagnostics.push(createScoreDiagnostic({
      code: 'M3N_TIE_TARGET_MISMATCH',
      message: located,
      range: { start: event.sourceStart, end: event.sourceEnd },
    }))
  }
  return diagnostics
}

export function validateScoreDocument(document: ScoreDocument, options: { skipBeatValidation?: boolean; source?: string } = {}): ScoreDiagnostic[] {
  const diagnostics: ScoreDiagnostic[] = []
  for (const part of document.parts.values()) {
    const melody = writtenMeasures(part.melody)
    const bass = writtenMeasures(part.bass)
    if (!options.skipBeatValidation) diagnostics.push(...validateMeasureDurations(document, melody, options.source))
    diagnostics.push(...validateTies(melody, options.source), ...validateTies(bass, options.source))
    if (bass.length === 0) continue
    if (melody.length !== bass.length) {
      const message = `双谱表小节数量不一致：正文 ${melody.length} 小节，低音 ${bass.length} 小节`
      diagnostics.push(createScoreDiagnostic({
        code: 'M3N_BASS_MEASURE_COUNT',
        message,
        range: measureRange(bass.at(-1)),
        messageArgs: { melodyMeasures: melody.length, bassMeasures: bass.length },
      }))
      continue
    }
    for (const [index, melodyMeasure] of melody.entries()) {
      const bassMeasure = bass[index]
      if (!bassMeasure) continue
      const melodyBeats = measureBeats(melodyMeasure)
      const bassBeats = measureBeats(bassMeasure)
      if (Math.abs(melodyBeats - bassBeats) <= EPSILON) continue
      const message = `双谱表第 ${index + 1} 小节时值不一致：正文 ${melodyBeats} 拍，低音 ${bassBeats} 拍`
      diagnostics.push(createScoreDiagnostic({
        code: 'M3N_BASS_DURATION_MISMATCH',
        message,
        range: measureRange(bassMeasure),
        messageArgs: { measure: index + 1, melodyBeats, bassBeats },
      }))
    }
  }
  return diagnostics
}
