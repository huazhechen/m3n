/** One tonic for each chromatic pitch class, matching score rendering. */
export const TRANSPOSE_KEYS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const

/** Clockwise fifths, with relative minors sharing each key signature. */
export const CIRCLE_OF_FIFTHS = [
  ['C', 'Am'], ['G', 'Em'], ['D', 'Bm'], ['A', 'F♯m'],
  ['E', 'C♯m'], ['B', 'G♯m'], ['F♯', 'D♯m'], ['D♭', 'B♭m'],
  ['A♭', 'Fm'], ['E♭', 'Cm'], ['B♭', 'Gm'], ['F', 'Dm'],
] as const

export function isMinorKey(key: string): boolean {
  return /^[A-G][#b♯♭]?m(?:\d|$)/.test(key)
}

/** Both rings select a signature; transposition preserves the source mode. */
export function circleKeyTarget(major: string, originalKey: string): number {
  return (keyPitchClass(major) + (isMinorKey(originalKey) ? 9 : 0)) % 12
}

export function keyPitchClass(key: string): number {
  const match = /^([A-G])([#b♯♭]?)/.exec(key)
  if (!match) return 0
  const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1]!]!
  const accidental = match[2] === '#' || match[2] === '♯' ? 1 : match[2] === 'b' || match[2] === '♭' ? -1 : 0
  return (natural + accidental + 12) % 12
}

export function currentKeyIndex(originalKey: string, transpose: number): number {
  return ((keyPitchClass(originalKey) + transpose) % 12 + 12) % 12
}

/** Smallest signed shift from the original tonic; the tritone goes upward. */
export function nearestKeyTranspose(originalKey: string, target: number): number {
  const distance = ((target - keyPitchClass(originalKey)) % 12 + 12) % 12
  return distance > 6 ? distance - 12 : distance
}
