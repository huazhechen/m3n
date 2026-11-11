import { resolveScorePitches, type ScoreDocument, type ScoreEvent } from '@m3n/notation'
import type { LyricsByEvent } from './lyrics.js'

const whole = (value: number) => Math.abs(value - Math.round(value)) < 1e-7

/** Full quarter-note continuations inside one measure can use native dashes.
 * Keep every source event separate so timing, source selection and lyrics retain
 * their identities. Fractional rhythms and independently marked notes keep ties.
 */
export function sustainContinuations(document: ScoreDocument, lyrics: LyricsByEvent): Map<ScoreEvent, ScoreEvent> {
  const result = new Map<ScoreEvent, ScoreEvent>()
  for (const part of document.parts.values()) for (const staff of ['melody', 'bass'] as const) {
    const absolutePitches = resolveScorePitches(part[staff])
    const pitches = (event: ScoreEvent) => [...(absolutePitches.get(event) ?? [])].sort().join(' ')
    for (const measure of part[staff]) {
      let beat = 0
      for (const [index, event] of measure.events.entries()) {
        const previous = measure.events[index - 1]
        const hasLyrics = [...(lyrics.get(event)?.values() ?? [])].some(rows => [...rows.values()].some(row => row.texts.some(text => text.trim())))
        const hasSlurStart = document.intervals.some(interval => interval.staff === staff && interval.kind === 'lg'
          && interval.start === event.sourceStart)
        if (previous?.tie && (event.kind === 'note' || event.kind === 'chord') && previous.kind === event.kind
          && event.key === previous.key && event.octaveShift === previous.octaveShift && pitches(event) === pitches(previous)
          && whole(beat) && whole(event.beats) && event.beats >= 1
          && event.meterCount === previous.meterCount && event.meterUnit === previous.meterUnit
          && event.tempo === previous.tempo && event.dynamic === previous.dynamic
          && !event.postfixes.length && !event.prefix && !event.chord && !event.text && !event.sectionLabel
          && !hasLyrics && !hasSlurStart) {
          result.set(event, result.get(previous) ?? previous)
        }
        beat += event.beats
      }
    }
  }
  return result
}
