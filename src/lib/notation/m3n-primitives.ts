export type ParsedM3NNote = {
  degreeRaw: string
  accidentals: string
  octave: string
  carets: string
  dots: string
  tie: string
}

export function parseKey(rawKey: string) {
  const match = /^([A-G](?:#|b)?)([A-Za-z]*)$/.exec(rawKey.trim())
  if (!match) {
    return { tonic: 'C', mode: '' }
  }

  return {
    tonic: match[1],
    mode: match[2] || '',
  }
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

  const [, degreeRaw, accidentals, octave, carets, dots, tie] = match
  return { degreeRaw, accidentals, octave, carets, dots, tie }
}
