import type { ScoreDocument } from './score-document'
import { validateScoreDocument } from './score-rules'

/** Derives renderer-facing meter failures from an already parsed score. */
export function invalidMeasureBarEnds(source: string, document: ScoreDocument) {
  const diagnostics = validateScoreDocument(document, { source })
  const invalidBarEnds = new Set(diagnostics.flatMap((diagnostic) => {
    if (!diagnostic.code.startsWith('M3N_METER_')) return []
    const index = Number(diagnostic.messageArgs?.measure ?? 1) - 1
    return [...document.parts.values()].flatMap((part) => {
      const barEnd = part.melody[index]?.barEnd
      return barEnd === undefined ? [] : [barEnd]
    })
  }))
  return [...invalidBarEnds].sort((left, right) => left - right)
}

/** Returns stable MEI measure IDs for meter-invalid measures. */
export function invalidMeasureIds(source: string, document: ScoreDocument) {
  const invalidEnds = new Set(invalidMeasureBarEnds(source, document))
  const renderedMeasureCount = (measures: Array<{ events: unknown[]; multiRest?: number }>) => {
    let count = measures.length
    while (count > 1 && measures[count - 1]?.events.length === 0 && !measures[count - 1]?.multiRest) count -= 1
    return count
  }

  return [...document.parts.values()].flatMap((part, partIndex) => {
    const measureCount = Math.max(renderedMeasureCount(part.melody), renderedMeasureCount(part.bass))
    return Array.from({ length: measureCount }, (_, measureIndex) => {
      const melody = part.melody[measureIndex]
      const bass = part.bass[measureIndex]
      return invalidEnds.has(melody?.barEnd ?? -1) || invalidEnds.has(bass?.barEnd ?? -1)
        ? `m3n-measure-${partIndex + 1}-${measureIndex + 1}`
        : null
    }).filter((id): id is string => id !== null)
  })
}
