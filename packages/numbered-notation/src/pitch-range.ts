import { m3nPitch, parseM3NGrace, parseM3NGroupPitches, resolveScorePitches, alternativePerformance, type ScoreDocument, type ScoreMeasure } from '@m3n/notation'
import { absoluteSemitones } from './fixed-do.js'

/** Scientific pitch notation; middle C is C4. */
function scientificPitch(absolute: string, transpose = 0): string {
  if (!transpose) {
    const [letter, octave, accidental = ''] = absolute.split(':')
    const alteration = ({ s: '#', ss: '##', x: '##', f: 'b', ff: 'bb' } as Record<string, string>)[accidental] ?? ''
    return `${letter!.toUpperCase()}${alteration}${octave}`
  }
  const value = absoluteSemitones(absolute) + transpose
  return `${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((value % 12) + 12) % 12]}${Math.floor(value / 12)}`
}

/** Melody range includes chord/tuplet members, grace notes and alternate melodies. */
export function scientificPitchRange(document: ScoreDocument, options: { fixedDo?: boolean; transpose?: number } = {}): [string, string] | undefined {
  let low: string | undefined, high: string | undefined
  const add = (absolute: string) => {
    const value = absoluteSemitones(absolute)
    if (low === undefined || value < absoluteSemitones(low)) low = absolute
    if (high === undefined || value > absoluteSemitones(high)) high = absolute
  }
  const visit = (measures: ScoreMeasure[]) => {
    const resolved = resolveScorePitches(measures)
    for (const measure of measures) for (const event of measure.events) {
      if (event.kind === 'rest') continue
      event.pitches.forEach((pitch, index) => { if (!pitch.startsWith('0')) add(resolved.get(event)![index]!) })
      for (const postfix of event.postfixes) {
        const grace = parseM3NGrace(postfix)
        if (!grace) continue
        for (const token of parseM3NGroupPitches(grace.pitchSource) ?? []) {
          if (token.startsWith('0')) continue
          const pitch = m3nPitch(token, event.key)
          add(`${pitch.pname}:${pitch.oct + event.octaveShift}:${pitch.accidGes ?? pitch.accid}`)
        }
      }
    }
  }
  const performance = document.orderKeys?.some(Boolean) ? alternativePerformance(document) : document
  for (const part of performance.parts.values()) visit(part.melody)
  for (const alternative of performance.alternatives ?? []) visit([alternative.measure])
  if (low === undefined || high === undefined) return undefined
  const spell = (pitch: string) => scientificPitch(pitch, options.transpose)
  return [spell(low), spell(high)]
}
