import type { ScoreDocument, ScoreEvent } from './notation/score-document.js'

/** Shared identity contract for MEI, numbered notation and playback. */
export function scoreEventIds(document: ScoreDocument): Map<ScoreEvent, string> {
  const ids = new Map<ScoreEvent, string>()
  const hasBass = [...document.parts.values()].some((part) => part.bass.some((measure) => measure.events.length > 0))
  let ordinal = 0
  for (const part of document.parts.values()) {
    const count = Math.max(part.melody.length, hasBass ? part.bass.length : 0)
    for (let index = 0; index < count; index += 1) {
      for (const event of part.melody[index]?.events ?? []) ids.set(event, `m3n-e-${++ordinal}`)
      for (const event of hasBass ? part.bass[index]?.events ?? [] : []) ids.set(event, `m3n-e-${++ordinal}`)
    }
  }
  return ids
}
