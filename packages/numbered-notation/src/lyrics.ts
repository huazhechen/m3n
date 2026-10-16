import { measurePlaybackPasses, parsePassRange, type ScoreDocument, type ScoreEvent } from '@m3n/notation'
type LyricTarget = { event: ScoreEvent; slot: number; tie: boolean }
export type LyricRowData = { texts: string[]; passes: ReadonlySet<number> | undefined; annotation?: string; underlined?: boolean }
export type LyricsByEvent = Map<ScoreEvent, Map<number, Map<number, LyricRowData>>>

export function lyricsByEvent(document: ScoreDocument): LyricsByEvent {
  // Rests hold horizontal space, but never consume a lyric syllable.
  const isInstrumentalEvent = (event: ScoreEvent) => document.intervals.some((interval) => (
    interval.kind === 'inst' &&
    interval.staff === 'melody' &&
    interval.start !== undefined &&
    interval.end !== undefined &&
    interval.start <= event.sourceStart &&
    event.sourceEnd <= interval.end
  ))
  const targetEvents: LyricTarget[] = [...document.parts.values()].flatMap((part) => part.melody
    .flatMap((measure) => measure.events)
    .filter((event) => event.kind !== 'rest' && !isInstrumentalEvent(event))
    .flatMap((event) => event.kind === 'tuplet'
      ? event.pitches.flatMap((pitch, slot) => pitch === '0' ? [] : [{
          event,
          slot,
          tie: event.tie && slot === event.tieFromTupletIndex,
        }])
      : [{ event, slot: 0, tie: event.tie }]))
  const result: LyricsByEvent = new Map()
  const passesByEvent = new Map<ScoreEvent, ReadonlySet<number>>()
  for (const part of document.parts.values()) {
    for (const [measure, passes] of measurePlaybackPasses(part.melody)) {
      const effective = passes.size > 0 ? passes : new Set([1])
      for (const event of measure.events) passesByEvent.set(event, effective)
    }
  }
  const rowPasses = (blockPasses: ReadonlySet<number> | undefined, event: ScoreEvent) => {
    const measurePasses = passesByEvent.get(event)
    if (blockPasses === undefined) return measurePasses
    if (measurePasses === undefined) return blockPasses
    return new Set([...blockPasses].filter((pass) => measurePasses.has(pass)))
  }
  document.lyrics.forEach((block) => {
    const numbered = /^\d+$/.exec(block.range)
    const pass = numbered ? undefined : /V(\d+)/.exec(block.phrasePasses ?? '')
    // This mirrors the MEI projection: generic L: is verse 1, while L2: and
    // lyrics limited to V2 use their explicit pass row.
    const row = Math.max(0, Number(numbered?.[0] ?? pass?.[1] ?? 1) - 1)
    const blockPassRange = block.sharedPasses || block.range || block.phrasePasses
    const blockPasses = blockPassRange ? parsePassRange(blockPassRange) : undefined
    const sharedPasses = block.sharedPasses ? parsePassRange(block.sharedPasses) : undefined
    const annotation = sharedPasses && sharedPasses.size > 1
      ? `${[...sharedPasses].sort((a, b) => a - b).join('.')}.`
      : undefined
    const targets = targetEvents.filter(({ event }) => block.targetStart === undefined || block.targetEnd === undefined || (event.sourceStart >= block.targetStart && event.sourceEnd <= block.targetEnd))
    const consumed = new Set<LyricTarget>()
    let annotationPending = annotation !== undefined
    let targetIndex = 0
    block.syllables.forEach((syllable) => {
      // A regular lyric item belongs to the first event of a tied chain and
      // must not consume any continuation events. Forced `+` lyrics are the
      // explicit exception and may target a continuation event directly.
      if (!syllable.forceTiedTarget) {
        while (targets[targetIndex - 1]?.tie) targetIndex += 1
      }
      const target = targets[targetIndex]
      targetIndex += 1
      if (!target || syllable.kind !== 'text') return
      consumed.add(target)
      const slots = result.get(target.event) ?? new Map<number, Map<number, LyricRowData>>()
      const rows = slots.get(target.slot) ?? new Map<number, LyricRowData>()
      const data = rows.get(row) ?? { texts: [], passes: undefined }
      data.texts.push(syllable.text)
      data.underlined = syllable.underlined
      data.passes = rowPasses(blockPasses, target.event)
      data.annotation = annotationPending ? annotation : undefined
      if (annotationPending) annotationPending = false
      rows.set(row, data)
      slots.set(target.slot, rows)
      result.set(target.event, slots)
    })
    // Notes inside the block's range that received no syllable still belong
    // to the row; reserve their slot so rendition-aware highlighting can
    // tell a missing first verse from a filled second one.
    for (const target of targets) {
      if (consumed.has(target)) continue
      const slots = result.get(target.event) ?? new Map<number, Map<number, LyricRowData>>()
      const rows = slots.get(target.slot) ?? new Map<number, LyricRowData>()
      const data = rows.get(row) ?? { texts: [], passes: undefined }
      data.passes = rowPasses(blockPasses, target.event)
      rows.set(row, data)
      slots.set(target.slot, rows)
      result.set(target.event, slots)
    }
  })
  return result
}

