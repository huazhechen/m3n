import { m3nPitch } from './m3n-direct.js'
import { parseKey } from './notation/m3n-primitives.js'

const LETTER_TO_MIDI: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }

/** Converts an M3N pitch token to MIDI for direct notation renderers. */
export function m3nPitchToMidi(pitch: string, key: string, octaveShift = 0) {
  const { pname, oct, accid } = m3nPitch(pitch, key)
  let midi = 12 * (oct + 1) + (LETTER_TO_MIDI[pname] ?? 0) + octaveShift * 12
  if (accid === 's' || accid === 'x') midi += accid === 'x' ? 2 : 1
  else if (accid === 'f' || accid === 'ff') midi -= accid === 'ff' ? 2 : 1
  return midi
}

/** Converts an M3N tonic to Jianpu's chromatic tonic index. */
export function jianpuKeyNumber(key: string) {
  const { tonic } = parseKey(key)
  let pitchClass = LETTER_TO_MIDI[tonic.charAt(0).toLowerCase()] ?? 0
  if (tonic.endsWith('#')) pitchClass += 1
  else if (tonic.endsWith('b')) pitchClass -= 1
  return (pitchClass + 12) % 12
}
