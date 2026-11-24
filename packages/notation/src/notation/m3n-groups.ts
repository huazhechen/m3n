const GROUP_PITCH = /^(?:0|[1-7](?:##?|bb?|=)?[ed]*)/ 

export type M3NGrace = {
  kind: 'ac' | 'ap'
  pitchSource: string
  depth: number
}

export type M3NTupletPitches = {
  pitches: string[]
  tiesFromLast: boolean
  internalTies: number[]
  internalSlurs: Array<[number, number]>
}

/** Parse consecutive group pitches without assigning meaning to whitespace. */
export function parseM3NGroupPitches(source: string): string[] | null {
  const normalized = source.replace(/\s+/g, '')
  const pitches: string[] = []
  let index = 0

  while (index < normalized.length) {
    const pitch = GROUP_PITCH.exec(normalized.slice(index))?.[0]
    if (!pitch) return null
    pitches.push(pitch)
    index += pitch.length
  }
  return pitches
}

/** Parse sequential pitches and the outgoing ties on their individual slots. */
export function parseM3NTupletPitches(source: string): M3NTupletPitches | null {
  const normalized = source.replace(/\s+/g, '')
  const pitches: string[] = [], ties: number[] = []
  const slurs: Array<[number, number]> = [], openSlurs: number[] = []
  let index = 0
  while (index < normalized.length) {
    if (normalized.startsWith('{lg}', index)) {
      openSlurs.push(pitches.length); index += 4; continue
    }
    if (normalized.startsWith('{/}', index)) {
      const start = openSlurs.pop(), end = pitches.length - 1
      if (start === undefined || start >= end || pitches[start] === '0' || pitches[end] === '0') return null
      slurs.push([start, end]); index += 3; continue
    }
    const pitch = GROUP_PITCH.exec(normalized.slice(index))?.[0]
    if (!pitch) return null
    pitches.push(pitch)
    index += pitch.length
    if (normalized[index] === '~') {
      if (pitch === '0') return null
      ties.push(pitches.length - 1)
      index++
    }
  }
  if (openSlurs.length) return null
  return { pitches, internalSlurs: slurs, tiesFromLast: ties.includes(pitches.length - 1), internalTies: ties.filter(slot => slot < pitches.length - 1) }
}

export function parseM3NGrace(value: string): M3NGrace | null {
  const match = /^(a[cp])(\(+)([^()]+)(\)+)$/.exec(value)
  if (!match) return null
  const open = match[2] ?? ''
  const close = match[4] ?? ''
  if (open.length !== close.length) return null

  return {
    kind: (match[1] ?? 'ac') as M3NGrace['kind'],
    pitchSource: match[3] ?? '',
    depth: open.length,
  }
}
