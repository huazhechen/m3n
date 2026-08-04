export type ParsedM3NNote = {
  degreeRaw: string
  accidentals: string
  octave: string
  carets: string
  dots: string
  tie: string
}

export const M3N_KEY_MODES = ['', 'dor', 'phr', 'lyd', 'mix', 'm', 'loc'] as const

const MODE_INTERVALS: Record<(typeof M3N_KEY_MODES)[number], readonly number[]> = {
  '': [0, 2, 4, 5, 7, 9, 11],
  dor: [0, 2, 3, 5, 7, 9, 10],
  phr: [0, 1, 3, 5, 7, 8, 10],
  lyd: [0, 2, 4, 6, 7, 9, 11],
  mix: [0, 2, 4, 5, 7, 9, 10],
  m: [0, 2, 3, 5, 7, 8, 10],
  loc: [0, 1, 3, 5, 6, 8, 10],
}

export function parseKey(rawKey: string): { tonic: string; mode: string } {
  const match = /^([A-G](?:#|b)?)([a-z]*)$/.exec(rawKey)
  if (!match || !M3N_KEY_MODES.includes((match[2] || '') as (typeof M3N_KEY_MODES)[number])) {
    return { tonic: 'C', mode: '' }
  }

  return {
    tonic: match[1] ?? 'C',
    mode: match[2] || '',
  }
}

export function keyModeIntervals(mode: string): readonly number[] {
  return MODE_INTERVALS[mode as keyof typeof MODE_INTERVALS] ?? MODE_INTERVALS['']
}

export function durationInBeats(depth: number, carets: number, dots: number) {
  let duration = 2 ** (carets - depth)
  let dotDuration = duration / 2

  for (let index = 0; index < dots; index += 1) {
    duration += dotDuration
    dotDuration /= 2
  }

  return duration
}

export function parseM3NNote(token: string): ParsedM3NNote | null {
  const match = /^(0|[1-7])([#b=]*)([ed]*)(\^*)(\.*)(~?)$/.exec(token)
  if (!match) {
    return null
  }

  const degreeRaw = match[1] ?? ''
  const accidentals = match[2] ?? ''
  const octave = match[3] ?? ''
  const carets = match[4] ?? ''
  const dots = match[5] ?? ''
  const tie = match[6] ?? ''
  if (degreeRaw === '0' && (accidentals || octave || tie)) return null
  if ((accidentals.includes('#') && accidentals.includes('b')) || (accidentals.includes('=') && accidentals !== '=')) return null
  if (accidentals.length > 2) return null
  if (octave.includes('e') && octave.includes('d')) return null
  return { degreeRaw, accidentals, octave, carets, dots, tie }
}
