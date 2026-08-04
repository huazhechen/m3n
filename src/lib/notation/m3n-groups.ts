const GROUP_PITCH = /^(?:0|[1-7](?:##?|bb?|=)?[ed]*)/

export type M3NGrace = {
  kind: 'ac' | 'ap'
  pitchSource: string
  depth: number
}

export type M3NTupletPitches = {
  pitches: string[]
  tiesFromLast: boolean
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

/** Parse a sequential group, allowing a tie only on its final pitched element. */
export function parseM3NTupletPitches(source: string): M3NTupletPitches | null {
  const normalized = source.replace(/\s+/g, '')
  const tiesFromLast = normalized.endsWith('~')
  const pitches = parseM3NGroupPitches(tiesFromLast ? normalized.slice(0, -1) : normalized)
  if (!pitches || (tiesFromLast && pitches.at(-1) === '0')) return null
  return { pitches, tiesFromLast }
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
