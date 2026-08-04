import type { DirectDocument, DirectEvent, DirectMeasure } from './m3n-direct'
import { measurePlaybackPasses } from './notation/repeats'

export type LyricTarget = { tied: boolean }

function isInstrumentalEvent(document: DirectDocument, event: DirectEvent) {
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
export function lyricTargetCountsByMeasure(document: DirectDocument) {
  const counts = new Map<DirectMeasure, number>()
  for (const part of document.parts.values()) {
    let previousTied = false
    for (const measure of part.melody) {
      let count = 0
      for (const event of measure.events) {
        const tiedTarget = previousTied || event.tieFrom !== undefined
        previousTied = event.tie
        if (event.kind === 'rest' || tiedTarget || isInstrumentalEvent(document, event)) continue
        count += lyricTargetCount(event)
      }
      counts.set(measure, count)
    }
  }
  return counts
}

/** Counts lyric targets for each performance pass of the written score. */
export function playbackLyricCounts(document: DirectDocument) {
  const counts = new Map<number, number>()
  for (const part of document.parts.values()) {
    const passesByMeasure = measurePlaybackPasses(part.melody)
    let previousTied = false
    for (const measure of part.melody) {
      const passes = passesByMeasure.get(measure) ?? new Set([1])
      for (const event of measure.events) {
        const tiedTarget = previousTied || event.tieFrom !== undefined
        previousTied = event.tie
        if (event.kind === 'rest' || tiedTarget || isInstrumentalEvent(document, event)) continue
        const targets = lyricTargetCount(event)
        for (const pass of passes) counts.set(pass, (counts.get(pass) ?? 0) + targets)
      }
    }
  }
  return counts
}

/** Counts positions shared by a selected set of lyric performance passes. */
export function sharedLyricRangeCount(document: DirectDocument, selectedPasses: ReadonlySet<number>) {
  let count = 0
  for (const part of document.parts.values()) {
    const passesByMeasure = measurePlaybackPasses(part.melody)
    let previousTied = false
    for (const measure of part.melody) {
      const passes = passesByMeasure.get(measure) ?? new Set([1])
      const isShared = !measure.ending && [...selectedPasses].every((pass) => passes.has(pass))
      const isSelectedEnding = Boolean(measure.ending) && [...selectedPasses].some((pass) => passes.has(pass))
      for (const event of measure.events) {
        const tiedTarget = previousTied || event.tieFrom !== undefined
        previousTied = event.tie
        if (!isShared && !isSelectedEnding) continue
        if (event.kind === 'rest' || tiedTarget) continue
        count += lyricTargetCount(event)
      }
    }
  }
  return count
}

/** Returns every sung target, retaining ties so forced lyrics can be validated. */
export function playbackLyricTargets(document: DirectDocument) {
  const targetsByPass = new Map<number, LyricTarget[]>()
  const partNames = document.partOrder.length > 0
    ? [...new Set(document.partOrder)]
    : [...document.parts.keys()]
  for (const name of partNames) {
    const part = document.parts.get(name)
    if (!part) continue
    const passesByMeasure = measurePlaybackPasses(part.melody)
    let previousTied = false
    for (const measure of part.melody) {
      const passes = passesByMeasure.get(measure) ?? new Set([1])
      for (const event of measure.events) {
        const tiedTarget = previousTied || event.tieFrom !== undefined
        previousTied = event.tie
        if (event.kind === 'rest' || isInstrumentalEvent(document, event)) continue
        const targetCount = lyricTargetCount(event)
        for (const pass of passes) {
          const targets = targetsByPass.get(pass) ?? []
          for (let index = 0; index < targetCount; index += 1) targets.push({ tied: tiedTarget && index === 0 })
          targetsByPass.set(pass, targets)
        }
      }
    }
  }
  return targetsByPass
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
