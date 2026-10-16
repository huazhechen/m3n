import { measurePlaybackPasses, parsePassRange, type ScoreDocument, type ScoreEvent, type ScoreLyricBlock } from '@m3n/notation'
type LyricTarget = { event: ScoreEvent; slot: number; tie: boolean }
type LyricPosition = { index: number; passage: number }
export type LyricRowData = { texts: string[]; passes: ReadonlySet<number> | undefined; annotation?: string; underlined?: boolean }
export type LyricsByEvent = Map<ScoreEvent, Map<number, Map<number, LyricRowData>>>

const phraseKey = (block: ScoreLyricBlock) => `${block.targetStart}:${block.targetEnd}`
const inPhrase = (event: ScoreEvent, block: ScoreLyricBlock) => block.targetStart === undefined || block.targetEnd === undefined || (event.sourceStart >= block.targetStart && event.sourceEnd <= block.targetEnd)
const lyricPasses = (block: ScoreLyricBlock) => {
  const range = block.sharedPasses || block.range || block.phrasePasses
  return range ? parsePassRange(range) : undefined
}
const lyricRow = (block: ScoreLyricBlock) => {
  const numbered = /^\d+$/.exec(block.range)
  const pass = numbered ? undefined : /V(\d+)/.exec(block.phrasePasses ?? '')
  // This mirrors the MEI projection: generic L: is verse 1, while L2: and
  // lyrics limited to V2 use their explicit pass row.
  return Math.max(0, Number(numbered?.[0] ?? pass?.[1] ?? 1) - 1)
}

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
  const melodyEvents = [...document.parts.values()].flatMap(part => part.melody.flatMap(measure => measure.events))
  const targetEvents: LyricTarget[] = melodyEvents
    .filter((event) => event.kind !== 'rest' && !isInstrumentalEvent(event))
    .flatMap((event) => event.kind === 'tuplet'
      ? event.pitches.flatMap((pitch, slot) => pitch === '0' ? [] : [{
          event,
          slot,
          tie: event.tie && slot === event.tieFromTupletIndex,
        }])
      : [{ event, slot: 0, tie: event.tie }])
  const result: LyricsByEvent = new Map()
  const passesByEvent = new Map<ScoreEvent, ReadonlySet<number>>()
  const positions = new Map<ScoreEvent, LyricPosition>()
  let index = 0, passage = 0
  for (const part of document.parts.values()) {
    passage += 1
    for (const [measure, passes] of measurePlaybackPasses(part.melody)) {
      if (measure.left === 'rptstart' || measure.multiRest) passage += 1
      const effective = passes.size > 0 ? passes : new Set([1])
      for (const event of measure.events) {
        if (event.sectionLabel) passage += 1
        positions.set(event, { index: index++, passage })
        passesByEvent.set(event, effective)
      }
      if (measure.right === 'rptend' || measure.right === 'rptboth' || measure.right === 'end') passage += 1
    }
  }
  const rowPasses = (blockPasses: ReadonlySet<number> | undefined, event: ScoreEvent) => {
    const measurePasses = passesByEvent.get(event)
    if (blockPasses === undefined) return measurePasses
    if (measurePasses === undefined) return blockPasses
    return new Set([...blockPasses].filter((pass) => measurePasses.has(pass)))
  }
  const annotatedPhrases = new Set(document.lyrics
    .filter(block => block.sharedPasses && parsePassRange(block.sharedPasses).size > 1)
    .map(phraseKey))
  const phrases = new Map<string, ScoreLyricBlock[]>()
  for (const block of document.lyrics) {
    const key = phraseKey(block)
    const blocks = phrases.get(key) ?? []
    blocks.push(block)
    phrases.set(key, blocks)
  }
  // Adjacent phrases with the same row/pass mapping share the labels already
  // emitted. Include rests and instrumental events when checking adjacency so
  // a phrase without lyrics interrupts the run. Layout breaks do not.
  const labeledRowsByPhrase = new Map<string, Set<number>>()
  let previous: { signature: string; end: LyricPosition | undefined; rows: Set<number> } | undefined
  for (const [key, blocks] of phrases) {
    const events = melodyEvents.filter(event => inPhrase(event, blocks[0]!))
    const first = events[0], last = events.at(-1)
    const start = first && positions.get(first)
    const end = last && positions.get(last)
    const mapping = blocks.map(block => `${lyricRow(block)}=${[...(lyricPasses(block) ?? [])].sort((a, b) => a - b).join(',')}`).sort().join(';')
    const signature = `${annotatedPhrases.has(key)}:${mapping}`
    const rows = previous && previous.signature === signature && start && previous.end
      && start.index === previous.end.index + 1 && start.passage === previous.end.passage
      ? previous.rows : new Set<number>()
    labeledRowsByPhrase.set(key, rows)
    previous = { signature, end, rows }
  }
  document.lyrics.forEach((block) => {
    const row = lyricRow(block)
    const blockPasses = lyricPasses(block)
    const annotation = annotatedPhrases.has(phraseKey(block))
      ? `${[...(blockPasses ?? [row + 1])].sort((a, b) => a - b).join('.')}.`
      : undefined
    const targets = targetEvents.filter(({ event }) => inPhrase(event, block))
    const consumed = new Set<LyricTarget>()
    const labeledRows = labeledRowsByPhrase.get(phraseKey(block))!
    let annotationPending = annotation !== undefined && !labeledRows.has(row)
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
      if (annotationPending) {
        labeledRows.add(row)
        annotationPending = false
      }
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

