import { m3nPitch, sectionVisitKey } from '@m3n/notation'

export function numberedKeyLabel(key: string) {
  const minor = /^([A-G][#b]?)m$/.exec(key)
  return minor ? `6=${minor[1]}` : `1=${key}`
}

export function absoluteSemitones(absolute: string) {
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

/** Transpose numbered 1 (the relative major in minor), preserving its octave. */
export function transposedKey(key: string, transpose = 0) {
  const pitch = m3nPitch('1', key)
  if (!transpose) {
    const accidental = ({ s: '#', ss: '##', f: 'b', ff: 'bb' } as Record<string, string>)[pitch.accidGes ?? pitch.accid] ?? ''
    return `${pitch.pname.toUpperCase()}${accidental}${pitch.oct}`
  }
  const semitones = absoluteSemitones(`${pitch.pname}:${pitch.oct}:${pitch.accidGes ?? pitch.accid}`) + transpose
  const chroma = ((semitones % 12) + 12) % 12
  const tonic = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][chroma]!
  return `${tonic}${Math.floor(semitones / 12)}`
}

/** Transpose the printed tonic while preserving major/minor display convention. */
export function transposedNumberedKeyLabel(key: string, transpose = 0) {
  return numberedKeyLabel(transpose ? sectionVisitKey(key, 'C', transposedKey('C',transpose).replace(/-?\d+$/, '')) : key)
}
