const GROUP_PITCH = /^(?:0|[1-7][#b=]*[ed]*)/

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
