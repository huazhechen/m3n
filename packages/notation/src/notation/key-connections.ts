import type { ScoreDocument, ScoreMeasure } from './score-document.js'
import { orderedMeasureVisits, playbackMeasureIndexes } from './repeats.js'
import { sectionEntryKey, sectionVisitKey } from './section-keys.js'

/** Keys carried by actual incoming playback edges, including skipped endings and returns. */
export function incomingMeasureKeys(document: ScoreDocument, measures: readonly ScoreMeasure[]) {
  const incoming = new Map<ScoreMeasure, Set<string>>()
  const visits = document.order
    ? orderedMeasureVisits(measures, document.order)
    : playbackMeasureIndexes(measures).map(index => ({ index, orderIndex: -1 }))
  let previous = document.key
  for (const { index, orderIndex } of visits) {
    const measure = measures[index]!
    const keys = incoming.get(measure) ?? new Set<string>()
    keys.add(previous)
    incoming.set(measure, keys)
    const last = measure.events.at(-1)?.key ?? measure.multiRestState?.key
    if (last) {
      const name = measure.sectionName
      const target = document.orderKeys?.[orderIndex]
      previous = name && target ? sectionVisitKey(last, sectionEntryKey(document, name), target) : last
    }
  }
  return incoming
}
