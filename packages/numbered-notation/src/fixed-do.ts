import { m3nPitch } from '@m3n/notation'

function absoluteSemitones(absolute: string) {
  const [letter, octave, accidental = ''] = absolute.split(':')
  const naturals: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
  const alterations: Record<string, number> = { s: 1, ss: 2, x: 2, f: -1, ff: -2, n: 0, '': 0 }
  return Number(octave) * 12 + naturals[letter!]! + alterations[accidental]!
}

/** C-based numbered spelling of an absolute pitch, with sharps only. */
export function fixedDoPitch(absolute: string, transpose = 0) {
  const semitones = absoluteSemitones(absolute) + transpose
  const chroma = ((semitones % 12) + 12) % 12
  const spelling = ['n1', '#1', 'n2', '#2', 'n3', 'n4', '#4', 'n5', '#5', 'n6', '#6', 'n7'][chroma]!
  const shift = Math.floor(semitones / 12) - 4
  return spelling + (shift > 0 ? "'".repeat(shift) : ','.repeat(-shift))
}

export function fixedDoGrace(token: string, key: string, shift: number, transpose = 0) {
  const pitch = m3nPitch(token, key)
  return fixedDoPitch(`${pitch.pname}:${pitch.oct + shift}:${pitch.accidGes ?? pitch.accid}`, transpose)
}

/** Transpose the tonic while preserving its absolute octave across B/C. */
export function transposedKey(key: string, transpose = 0) {
  if (!transpose) return `${/^([A-G][#b]?)/.exec(key)?.[1] ?? 'C'}4`
  const pitch = m3nPitch('1', key)
  const semitones = absoluteSemitones(`${pitch.pname}:${pitch.oct}:${pitch.accidGes ?? pitch.accid}`) + transpose
  const chroma = ((semitones % 12) + 12) % 12
  const tonic = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][chroma]!
  return `${tonic}${Math.floor(semitones / 12)}`
}
