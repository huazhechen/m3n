import type { ScoreDocument, ScoreMeasure } from './score-document.js'
import { orderedMeasureVisits, playbackMeasureIndexes, parsePassRange } from './repeats.js'
import { sectionEntryKey, sectionVisitKey } from './section-keys.js'

/** Keys carried by actual incoming playback edges, including skipped endings and returns. */
export function incomingMeasureKeys(document: ScoreDocument, measures: readonly ScoreMeasure[]) {
  const incoming = new Map<ScoreMeasure, Set<string>>()
  const visits = document.order
    ? orderedMeasureVisits(measures, document.order)
    : playbackMeasureIndexes(measures).map(index => ({ index, orderIndex: -1 }))
  const visitsByMeasure = new Map<ScoreMeasure, number>()
  let previous = document.key
  for (const { index, orderIndex } of visits) {
    const measure = measures[index]!
    const visit = (visitsByMeasure.get(measure) ?? 0) + 1
    visitsByMeasure.set(measure, visit)
    const pass = measure.ending ? [...parsePassRange(measure.ending)][visit-1] ?? visit : visit
    const keys = incoming.get(measure) ?? new Set<string>()
    keys.add(previous)
    incoming.set(measure, keys)
    const settings = measure.events.at(-1) ?? measure.multiRestState
    const last = settings?.keyPasses?.[pass-1] ?? settings?.key
    if (last) {
      const name = measure.sectionName
      const target = document.orderKeys?.[orderIndex]
      previous = name && target ? sectionVisitKey(last, sectionEntryKey(document, name), target) : last
    }
  }
  return incoming
}
