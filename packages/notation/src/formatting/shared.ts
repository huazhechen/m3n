import { durationInBeats } from '../notation/m3n-primitives.js'
import type { ScoreDocument, ScoreEvent } from '../notation/score-document.js'
import type { M3NSyntaxTree } from '../notation/syntax-tree.js'

export type FormatContext = { score: ScoreDocument; syntaxTree: M3NSyntaxTree }
export type SourceEdit = { start: number; end: number; value: string }
export const EPSILON = 1e-9

/** One visit per written measure, including alternate melodies. */
export function scoreMeasures(score: ScoreDocument) {
  return [...new Set([
    ...[...score.parts.values()].flatMap((part) => [...part.melody, ...part.bass]),
    ...(score.alternatives ?? []).map((alternative) => alternative.measure),
  ])]
}

/** All offsets/durations use quarter-note beats, including compound meters. */
export function beatGroup(event: Pick<ScoreEvent, 'meterCount' | 'meterUnit'>) {
  const count = event.meterCount ?? 4
  return (count > 3 && count % 3 === 0 ? 3 : 1) * 4 / (event.meterUnit ?? 4)
}

export function applyEdits(source: string, edits: SourceEdit[]) {
  let boundary = source.length
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (edit.end > boundary) continue
    source = source.slice(0, edit.start) + edit.value + source.slice(edit.end)
    boundary = edit.start
  }
  return source
}

/** One spelling policy for both scope simplification and sustained-note rewrites. */
export function spellDuration(pitch: string, beats: number, tied = false, minimumDepth = 0, maximumDepth = minimumDepth + 16) {
  for (let depth = minimumDepth; depth <= maximumDepth; depth += 1) {
    for (let carets = 0; carets <= 6; carets += 1) for (let dots = 0; dots <= 4; dots += 1) {
      if (Math.abs(durationInBeats(depth, carets, dots) - beats) < EPSILON) {
        const raw = `${pitch}${'^'.repeat(carets)}${'.'.repeat(dots)}${tied ? '~' : ''}`
        return { raw, depth, carets, dots }
      }
    }
  }
  return null
}
