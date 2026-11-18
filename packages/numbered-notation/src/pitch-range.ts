import { m3nPitch, parseM3NGrace, parseM3NGroupPitches, resolveScorePitches, unfoldScorePerformance, type ScoreDocument, type ScoreMeasure } from '@m3n/notation'
import { absoluteSemitones, fixedDoPitch } from './fixed-do.js'

/** Spell a resolved pitch against the opening key, including inherited accidentals. */
function relativePitch(absolute: string, key: string): string {
  const letters = 'cdefgab'
  const [letter, octave] = absolute.split(':')
  const tonic = letters.indexOf(m3nPitch('1', key).pname)
  const degree = (letters.indexOf(letter!) - tonic + 7) % 7 + 1
  const base = m3nPitch(String(degree), key)
  const shift = Number(octave) - base.oct
  const expected = `${base.pname}:${Number(octave)}:${base.accidGes ?? base.accid}`
  const alteration = absoluteSemitones(absolute) - absoluteSemitones(expected)
  return `${alteration > 0 ? '#'.repeat(alteration) : 'b'.repeat(-alteration)}${degree}${shift > 0 ? "'".repeat(shift) : ','.repeat(-shift)}`
}

/** Melody range includes chord/tuplet members, grace notes and alternate melodies. */
export function numberedPitchRange(document: ScoreDocument, options: { fixedDo?: boolean; transpose?: number } = {}): [string, string] | undefined {
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
  const performance = document.orderKeys?.some(Boolean) ? unfoldScorePerformance(document) : document
  for (const part of performance.parts.values()) visit(part.melody)
  if (low === undefined || high === undefined) return undefined
  const spell = (pitch: string) => options.fixedDo ? fixedDoPitch(pitch, options.transpose).replace(/^n/, '') : relativePitch(pitch, document.key)
  return [spell(low), spell(high)]
}
