import { createScoreDiagnostic, type ScoreDiagnostic } from './diagnostics'
import type { ScoreDocument, ScoreMeasure } from './score-document'

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

/** Semantic rules that only require the normalized score model. */
export function validateScoreDocument(document: ScoreDocument): ScoreDiagnostic[] {
  const diagnostics: ScoreDiagnostic[] = []
  for (const part of document.parts.values()) {
    const melody = writtenMeasures(part.melody)
    const bass = writtenMeasures(part.bass)
    if (bass.length === 0) continue
    if (melody.length !== bass.length) {
      const message = `双谱表小节数量不一致：正文 ${melody.length} 小节，低音 ${bass.length} 小节`
      diagnostics.push(createScoreDiagnostic({
        code: 'M3N_BASS_MEASURE_COUNT',
        message,
        legacyMessage: message,
        range: measureRange(bass.at(-1)),
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
        legacyMessage: message,
        range: measureRange(bassMeasure),
      }))
    }
  }
  return diagnostics
}
