import type { DirectEvent, DirectMeasure } from './m3n-direct'
import type { ScoreDocument } from './notation/score-document'

export type LyricTarget = { tied: boolean }

function isInstrumentalEvent(document: ScoreDocument, event: DirectEvent) {
  return document.intervals.some((interval) => interval.kind === 'inst'
    && interval.staff === 'melody'
    && interval.start !== undefined
    && interval.end !== undefined
    && interval.start <= event.sourceStart
    && event.sourceEnd <= interval.end)
}

function lyricTargetCount(event: DirectEvent) {
  return event.kind === 'tuplet' ? event.pitches.filter((pitch) => pitch !== '0').length : 1
}

/** Counts written lyric targets in each melody measure. */
export function lyricTargetCountsByMeasure(document: ScoreDocument) {
  const counts = new Map<DirectMeasure, number>()
  for (const part of document.parts.values()) {
    let previousTied = false
    for (const measure of part.melody) {
      let count = 0
      for (const event of measure.events) {
        const tiedTarget = previousTied
        previousTied = event.tie
        if (event.kind === 'rest' || tiedTarget || isInstrumentalEvent(document, event)) continue
        count += lyricTargetCount(event)
      }
      counts.set(measure, count)
    }
  }
  return counts
}

export function hasForcedLyricOutsideTiedTarget(items: readonly { forceTiedTarget: boolean }[], targets: readonly LyricTarget[]) {
  let targetIndex = 0
  for (const item of items) {
    if (item.forceTiedTarget) {
      if (!targets[targetIndex]?.tied) return true
      targetIndex += 1
      continue
    }
    while (targets[targetIndex]?.tied) targetIndex += 1
    if (targetIndex >= targets.length) break
    targetIndex += 1
  }
  return false
}
