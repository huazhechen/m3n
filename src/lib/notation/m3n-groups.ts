const GROUP_PITCH = /^(?:0|[1-7](?:##?|bb?|=)?[ed]*)/

export type M3NGrace = {
  kind: 'ac' | 'ap'
  pitchSource: string
  depth: number
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

export function parseM3NGrace(value: string): M3NGrace | null {
  const match = /^(a[cp])(\(+)([^()]+)(\)+)$/.exec(value)
  if (!match || match[2].length !== match[4].length) return null

  return {
    kind: match[1] as M3NGrace['kind'],
    pitchSource: match[3],
    depth: match[2].length,
  }
}
