/** Compare attacks and durations independently of tied-note/rest spelling. */
export function soundingEvents<T extends number | string | null>(events: ReadonlyArray<{ pitch: T; beats: number; tie: boolean }>) {
  const spans: Array<{ pitch: T; beats: number; tie: boolean }> = []
  for (const event of events) {
    const previous = spans.at(-1)
    const rest = event.pitch === null || event.pitch === '0'
    if (previous && previous.pitch === event.pitch && (previous.tie || rest)) {
      previous.beats += event.beats
      previous.tie = event.tie
    } else spans.push({ pitch: event.pitch, beats: event.beats, tie: event.tie })
  }
  return spans
}

export function soundingBar(tokens: string[]) {
  return soundingEvents(tokens.map(token => {
    const [pitch, value] = token.split(':')
    return { pitch, beats: Number(value!.replace(/~$/, '')), tie: value!.endsWith('~') }
  }))
}
