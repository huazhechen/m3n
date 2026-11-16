import { m3nPitch } from '@m3n/notation'

/** C-based numbered spelling of an absolute pitch, with sharps only. */
export function fixedDoPitch(absolute: string) {
  const [letter, octave, accidental = ''] = absolute.split(':')
  const naturals: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
  const alterations: Record<string, number> = { s: 1, ss: 2, x: 2, f: -1, ff: -2, n: 0, '': 0 }
  const semitones = Number(octave) * 12 + naturals[letter!]! + alterations[accidental]!
  const chroma = ((semitones % 12) + 12) % 12
  const spelling = ['n1', '#1', 'n2', '#2', 'n3', 'n4', '#4', 'n5', '#5', 'n6', '#6', 'n7'][chroma]!
  const shift = Math.floor(semitones / 12) - 4
  return spelling + (shift > 0 ? "'".repeat(shift) : ','.repeat(-shift))
}

export function fixedDoGrace(token: string, key: string, shift: number) {
  const pitch = m3nPitch(token, key)
  return fixedDoPitch(`${pitch.pname}:${pitch.oct + shift}:${pitch.accidGes ?? pitch.accid}`)
}
