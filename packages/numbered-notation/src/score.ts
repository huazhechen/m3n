import {
  measurePlaybackPasses,
  parseM3NGrace,
  parseM3NGroupPitches,
  parsePassRange,
  type ScoreDocument,
  type ScoreEvent,
  type ScoreInterval,
  type ScoreMeasure,
} from '@m3n/notation'
import { createNumberedNotationLayout } from './core/config.js'
import { layoutVoiceGroup } from './core/layout.js'
import { continuousPageHeight, paginateVoiceGroups, renderNumberedNotationPages } from './core/renderer.js'
import type {
  BarlineElement,
  LyricSyllable,
  Mark,
  MusicElement,
  NoteElement,
  ScoreDocument as NumberedNotationDocument,
  ScoreLine,
  VoiceGroup,
} from './core/types.js'

export type NumberedNotationRenderOptions = {
  paged: boolean
  width: number
  musicFontCss?: string
}

type EventEntry = { event: ScoreEvent; index: number; lastIndex: number }
type LyricTarget = { event: ScoreEvent; slot: number; tie: boolean }
type LyricRowData = { texts: string[]; passes: ReadonlySet<number> | undefined }
type LyricsByEvent = Map<ScoreEvent, Map<number, Map<number, LyricRowData>>>

function location(event: ScoreEvent) {
  return { line: 1, column: event.sourceStart + 1, offset: event.sourceStart, length: event.sourceEnd - event.sourceStart }
}

function duration(beats: number) {
  const safe = Math.max(0.125, beats)
  const base = 2 ** Math.floor(Math.log2(safe))
  const ratio = safe / base
  const dots = ratio >= 1.875 - 1e-6 ? 3 : ratio >= 1.75 - 1e-6 ? 2 : ratio >= 1.5 - 1e-6 ? 1 : 0
  return { duration: 4 / base, dots }
}

function pitch(token: string) {
  const match = /^([1-7])([#b=]*)([ed]*)$/.exec(token)
  if (!match) return { pitch: 0 as const, octave: 0, accidental: undefined }
  const accidental = match[2] === '#' ? 'sharp' as const : match[2] === 'b' ? 'flat' as const : match[2] === '=' ? 'natural' as const : undefined
  const octave = [...(match[3] ?? '')].reduce((value, item) => value + (item === 'e' ? 1 : -1), 0)
  return { pitch: Number(match[1]) as NoteElement['pitch'], octave, accidental }
}

function ornaments(event: ScoreEvent) {
  const names = [event.dynamic, event.prefix, ...event.postfixes]
    .flatMap((value) => value ? [value === 'sfz' ? 'sf' : value] : [])
    .filter((name) => ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sf', 'tr', 'cresc', 'dim', 'rit'].includes(name))
  return names.map((name) => ({ name, level: 0 }))
}

function graceNotes(event: ScoreEvent): NoteElement[] {
  return event.postfixes.flatMap((postfix) => {
    const grace = parseM3NGrace(postfix)
    const pitches = grace === null ? null : parseM3NGroupPitches(grace.pitchSource)
    if (grace === null || pitches === null) return []
    const beats = 4 / 2 ** (grace.depth + 2)
    return pitches.map((value) => note(event, undefined, beats, value, undefined, false))
  })
}

function note(
  event: ScoreEvent,
  id: string | undefined,
  beats = event.beats,
  value = event.pitches[0] ?? '0',
  m3nDataId = id,
  includeGrace = true,
  keyChange?: string,
  includeText = true,
): NoteElement {
  const rendered = pitch(value)
  const time = duration(beats)
  const graceBefore = includeGrace ? graceNotes(event) : []
  return {
    kind: 'note',
    ...rendered,
    sound: rendered.pitch === 0 ? 'rest' : 'note',
    hidden: false,
    ...time,
    ornaments: ornaments(event),
    annotation: includeText ? event.text ?? event.chord : undefined,
    sectionLabel: includeText ? event.sectionLabel : undefined,
    keyChange,
    code: value,
    m3nId: id,
    m3nDataId,
    chordPitches: event.kind === 'chord' ? event.pitches.slice(1).flatMap((item) => {
      const itemPitch = pitch(item)
      return itemPitch.pitch === 0 ? [] : [{ pitch: itemPitch.pitch as 1 | 2 | 3 | 4 | 5 | 6 | 7, octave: itemPitch.octave, accidental: itemPitch.accidental }]
    }) : [],
    ...(graceBefore.length === 0 ? {} : { graceBefore }),
    source: location(event),
  }
}

function barline(measure: ScoreMeasure, fallback: boolean): BarlineElement {
  const type = measure.right === 'end' ? 'end'
    : measure.right === 'dbl' ? 'double'
      : measure.right === 'rptend' ? 'repeat-end'
        : measure.right === 'rptboth' ? 'repeat-both'
          : fallback ? 'normal' : 'normal'
  const navigation = measure.navigation ?? []
  return {
    kind: 'barline', type, ornaments: navigation.map((name) => ({ name, level: 0 })),
    code: '|', source: { line: 1, column: 1, offset: 0, length: 0 },
  }
}

function lyricsByEvent(document: ScoreDocument): LyricsByEvent {
  // Rests hold horizontal space, but never consume a lyric syllable.
  const targetEvents: LyricTarget[] = [...document.parts.values()].flatMap((part) => part.melody
    .flatMap((measure) => measure.events)
    .filter((event) => event.kind !== 'rest')
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
    const blockPassRange = block.range || block.phrasePasses
    const blockPasses = blockPassRange ? parsePassRange(blockPassRange) : undefined
    const targets = targetEvents.filter(({ event }) => block.targetStart === undefined || block.targetEnd === undefined || (event.sourceStart >= block.targetStart && event.sourceEnd <= block.targetEnd))
    const consumed = new Set<LyricTarget>()
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
      data.passes = rowPasses(blockPasses, target.event)
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

function lyricLines(entries: readonly EventEntry[], lyrics: LyricsByEvent) {
  const activeRows = new Set(entries.flatMap(({ event }) => [...(lyrics.get(event)?.values() ?? [])].flatMap((rows) => [...rows.keys()].filter((row) => rows.get(row)?.texts.some((text) => text !== '') ?? false))))
  return [...activeRows].sort((left, right) => left - right).map((row) => ({
    rendition: row + 1,
    syllables: entries.flatMap(({ event, index, lastIndex }) => {
      const slots = lyrics.get(event)
      const count = lastIndex - index + 1
      if (event.kind === 'rest') {
        return Array.from({ length: count }, () => ({ text: '', source: location(event), absent: true }))
      }
      const syllableFor = (slot: number): LyricSyllable => {
        const data = slots?.get(slot)?.get(row)
        if (data === undefined) return { text: '', source: location(event), absent: true }
        return {
          text: data.texts.join(''),
          source: location(event),
          ...(data.passes === undefined ? {} : { passes: data.passes }),
        }
      }
      if (event.kind !== 'tuplet') return [syllableFor(0)]
      return Array.from({ length: count }, (_, slot) => syllableFor(slot))
    }),
    source: { line: 1, column: 1, offset: 0, length: 0 },
  }))
}

function lineForMeasures(
  measures: readonly ScoreMeasure[],
  lyrics: LyricsByEvent,
  voice: number,
  ids: ReadonlyMap<ScoreEvent, string>,
  endingContinuation = { fromPrevious: false, toNext: false },
  initialKey = 'C',
): ScoreLine {
  const elements: MusicElement[] = []
  const entries: EventEntry[] = []
  const measureRanges: Array<{ measure: ScoreMeasure; start: number; end: number }> = []
  let activeKey = initialKey
  // The direct ScoreDocument keeps the parser's post-bar placeholder measure.
  // It carries no musical or boundary semantics and must not become an empty
  // rendered measure after the final barline/repeat barline.
  const renderMeasures = [...measures]
  while (renderMeasures.length > 0) {
    const last = renderMeasures.at(-1)
    if (!last || last.events.length > 0 || last.multiRest || last.left !== undefined || last.right !== undefined) break
    renderMeasures.pop()
  }
  if (renderMeasures[0]?.ending !== undefined) {
    elements.push({ kind: 'barline', type: 'normal', ornaments: [], code: '|', source: { line: 1, column: 1, offset: 0, length: 0 } })
  }
  renderMeasures.forEach((measure, measureIndex) => {
    const start = elements.length
    const previousMeasure = renderMeasures[measureIndex - 1]
    const nextMeasure = renderMeasures[measureIndex + 1]
    const joinsRepeatBoundary = previousMeasure?.right !== undefined && measure.left === 'rptstart'
    if (measure.left === 'rptstart' && !joinsRepeatBoundary) {
      elements.push({ ...barline(measure, false), type: 'repeat-start' })
    }
    measure.events.forEach((event) => {
      const index = elements.length
      const keyChange = event.key === activeKey ? undefined : event.key
      activeKey = event.key
      if (event.kind === 'tuplet' && event.tuplet) {
        const eventId = ids.get(event)
        const tuplet = event.tuplet
        event.pitches.forEach((value, tupletIndex) => {
          elements.push(note(
            event,
            eventId === undefined ? undefined : `${eventId}-n${tupletIndex + 1}`,
            tuplet.unitBeats,
            value,
            eventId,
            true,
            tupletIndex === 0 ? keyChange : undefined,
            tupletIndex === 0,
          ))
        })
        entries.push({ event, index, lastIndex: elements.length - 1 })
        return
      }
      const entry = { event, index, lastIndex: index }
      entries.push(entry)
      // Rests must not borrow the sustain mark (`-`). Expand whole beats to
      // individual rest symbols and retain only a fractional final duration
      // on the final rest glyph.
      if (event.kind === 'rest') {
        let remaining = event.beats
        let first = true
        while (remaining >= 1 - 1e-7) {
          elements.push(note(event, ids.get(event), 1, undefined, undefined, false, first ? keyChange : undefined))
          remaining -= 1
          first = false
        }
        if (remaining > 1e-7) {
          elements.push(note(event, ids.get(event), remaining, undefined, undefined, false, first ? keyChange : undefined))
        }
        entry.lastIndex = elements.length - 1
        return
      }
      // Keep a fractional first beat on the note itself so dotted values retain
      // their augmentation dots; whole beats after it remain sustain symbols.
      const noteBeats = Number.isInteger(event.beats) ? 1 : Math.min(1.75, event.beats)
      elements.push(note(event, ids.get(event), noteBeats, undefined, undefined, true, keyChange))
      const sustainCount = Math.max(0, Math.floor(event.beats - noteBeats + 1e-7))
      for (let sustain = 0; sustain < sustainCount; sustain += 1) {
        elements.push({
          kind: 'sustain', duration: 4, ornaments: [], code: '-',
          m3nDataId: ids.get(event), source: location(event),
        })
      }
    })
    if (measure.multiRest) {
      const rest: ScoreEvent = { sourceStart: 0, sourceEnd: 0, kind: 'rest', pitches: [], key: 'C', beats: measure.multiRest * 4, tie: false, postfixes: [], navigation: [], octaveShift: 0 }
      entries.push({ event: rest, index: elements.length, lastIndex: elements.length })
      elements.push(note(rest, undefined))
    }
    const repeatBoundary = nextMeasure?.left === 'rptstart'
      ? measure.right === 'rptend' ? 'repeat-both' : 'repeat-start'
      : undefined
    elements.push(repeatBoundary === undefined
      ? barline(measure, measureIndex === renderMeasures.length - 1)
      : { ...barline(measure, false), type: repeatBoundary })
    measureRanges.push({ measure, start, end: elements.length - 1 })
  })
  const marks: Mark[] = []
  entries.forEach((entry, index) => {
    const next = entries[index + 1]
    if (entry.event.tie && next) marks.push({ type: 'slur', start: entry.event.kind === 'tuplet' ? entry.lastIndex : entry.index, end: next.index, level: 0, source: location(entry.event) })
    if (entry.event.kind === 'tuplet' && entry.event.tuplet) marks.push({ type: 'tuplet', start: entry.index, end: entry.lastIndex, level: 0, caption: String(entry.event.tuplet.num), source: location(entry.event) })
  })
  let rangeIndex = 0
  while (rangeIndex < measureRanges.length) {
    const first = measureRanges[rangeIndex]
    const ending = first?.measure.ending
    if (!first || !ending) { rangeIndex += 1; continue }
    let last = rangeIndex
    while (measureRanges[last + 1]?.measure.ending === ending) last += 1
    const lastRange = measureRanges[last] ?? first
    const caption = ending.replaceAll('V', '').split(',').filter(Boolean).join(',')
    const previous = elements[first.start - 1]
    const start = previous?.kind === 'barline' ? first.start - 1 : first.start
    const continuesFromPrevious = rangeIndex === 0 && endingContinuation.fromPrevious
    const continuesToNext = last === measureRanges.length - 1 && endingContinuation.toNext
    marks.push({
      type: 'volta', start, end: lastRange.end, level: 0,
      caption: continuesFromPrevious || !caption ? undefined : `${caption}.`,
      ...(continuesFromPrevious ? { continuationFromPrevious: true } : {}),
      ...(continuesToNext ? { continuationToNext: true } : {}),
      source: { line: 1, column: 1, offset: 0, length: 0 },
    })
    rangeIndex = last + 1
  }
  return { voice, elements, marks, lyrics: lyricLines(entries, lyrics), raw: '', source: { line: 1, column: 1, offset: 0, length: 0 } }
}

function addIntervals(lines: readonly ScoreLine[], intervals: readonly ScoreInterval[]) {
  lines.forEach((line) => {
    const staff = line.voice === 1 ? 'melody' : 'bass'
    // Sustain symbols extend a long note across its full duration, so they
    // must anchor interval endpoints too: a four-beat crescendo over one
    // whole note otherwise collapses onto its first numeral.
    const entries = line.elements.flatMap((element, index) =>
      element.kind === 'note' || element.kind === 'sustain'
        // The parser's multi-rest placeholder carries a zero-length source
        // and must never anchor an interval end; it would otherwise pull a
        // slur across a `{rest=N}` measure onto the rest glyph.
        ? element.source.length > 0
          ? [{ element, index }]
          : []
        : [],
    )
    const first = entries[0]
    const last = entries.at(-1)
    if (!first || !last) return
    const legato: Mark[] = []
    intervals.filter((interval) => interval.staff === staff).forEach((interval) => {
      const intervalStart = interval.start
      const intervalEnd = interval.endStart
      if (intervalStart === undefined || intervalEnd === undefined) return
      if (intervalEnd < first.element.source.offset || intervalStart > last.element.source.offset) return
      const start = entries.find((entry) => entry.element.source.offset >= intervalStart) ?? first
      const end = [...entries].reverse().find((entry) => entry.element.source.offset <= intervalEnd) ?? last
      if (start.index > end.index) return
      const type = interval.kind === 'cresc' ? 'crescendo' : interval.kind === 'decres' ? 'decrescendo' : interval.kind === 'lg' ? 'slur' : undefined
      if (!type) return
      const mark: Mark = {
        type, start: start.index, end: end.index, level: 0,
        ...(intervalStart < first.element.source.offset ? { continuationFromPrevious: true } : {}),
        ...(intervalEnd > last.element.source.offset ? { continuationToNext: true } : {}),
        source: { line: 1, column: 1, offset: intervalStart, length: 0 },
      }
      if (type !== 'slur') { line.marks.push(mark); return }
      const previous = legato.at(-1)
      const hasMusicalGap = previous !== undefined && line.elements
        .slice(previous.end + 1, mark.start)
        .some((element) => element.kind === 'note' || element.kind === 'sustain')
      if (previous && !hasMusicalGap) {
        previous.end = mark.end
        previous.continuationToNext = mark.continuationToNext
      } else legato.push(mark)
    })
    line.marks.push(...legato)
  })
}

function groupForMeasures(
  melody: readonly ScoreMeasure[],
  bass: readonly ScoreMeasure[],
  lyrics: LyricsByEvent,
  intervals: readonly ScoreInterval[],
  ids: ReadonlyMap<ScoreEvent, string>,
  endingContinuation?: { fromPrevious: boolean; toNext: boolean },
  initialKey?: string,
): VoiceGroup {
  const lines = [lineForMeasures(melody, lyrics, 1, ids, endingContinuation, initialKey)]
  if (bass.some((measure) => measure.events.length > 0 || measure.multiRest)) lines.push(lineForMeasures(bass, lyrics, 2, ids, undefined, initialKey))
  addIntervals(lines, intervals)
  return { index: 0, voices: lines }
}

function keyBeforeMeasure(measures: readonly ScoreMeasure[], index: number, fallback: string) {
  for (let measureIndex = index - 1; measureIndex >= 0; measureIndex -= 1) {
    const events = measures[measureIndex]?.events
    const key = events?.at(-1)?.key
    if (key !== undefined) return key
  }
  return fallback
}

/**
 * Partition a segment into `lineCount` contiguous runs whose natural widths
 * are as even as possible. `prefixWidths[k]` is the natural width of the
 * first k measures, so a candidate line `[i, j)` measures
 * `prefixWidths[j] - prefixWidths[i]`. The DP minimizes the widest line;
 * ties keep earlier lines at the smallest split count so later lines are not
 * starved.
 */
function balancedLineSizes(prefixWidths: readonly number[], lineCount: number): number[] {
  const measureCount = prefixWidths.length - 1
  if (lineCount <= 1) return [measureCount]
  if (lineCount >= measureCount) return Array.from({ length: measureCount }, () => 1)
  const widest: number[][] = Array.from({ length: lineCount + 1 }, () =>
    Array(measureCount + 1).fill(Number.POSITIVE_INFINITY),
  )
  const splitAt: number[][] = Array.from({ length: lineCount + 1 }, () =>
    Array(measureCount + 1).fill(0),
  )
  widest[0]![0] = 0
  for (let lines = 1; lines <= lineCount; lines += 1) {
    for (let measures = lines; measures <= measureCount; measures += 1) {
      let best = Number.POSITIVE_INFINITY
      let bestSplit = -1
      for (let previous = lines - 1; previous < measures; previous += 1) {
        const candidate = Math.max(
          widest[lines - 1]![previous]!,
          prefixWidths[measures]! - prefixWidths[previous]!,
        )
        if (candidate < best) {
          best = candidate
          bestSplit = previous
        }
      }
      widest[lines]![measures] = best
      splitAt[lines]![measures] = bestSplit
    }
  }
  const sizes: number[] = []
  let measures = measureCount
  for (let lines = lineCount; lines >= 1; lines -= 1) {
    const previous = splitAt[lines]![measures]!
    sizes.unshift(measures - previous)
    measures = previous
  }
  return sizes
}

function systemGroups(document: ScoreDocument, width: number) {
  const part = [...document.parts.values()][0]
  if (!part) return []
  let measureCount = part.melody.length
  while (measureCount > 0) {
    const last = part.melody[measureCount - 1]
    if (!last || last.events.length > 0 || last.multiRest || last.left !== undefined || last.right !== undefined) break
    measureCount -= 1
  }
  const ids = new Map<ScoreEvent, string>()
  let ordinal = 0
  const hasBassStaff = [...document.parts.values()].some((scorePart) => scorePart.bass.some((measure) => measure.events.length > 0))
  for (const scorePart of document.parts.values()) {
    const measureCount = Math.max(scorePart.melody.length, hasBassStaff ? scorePart.bass.length : 0)
    for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
      for (const event of scorePart.melody[measureIndex]?.events ?? []) ids.set(event, `m3n-e-${++ordinal}`)
      for (const event of hasBassStaff ? scorePart.bass[measureIndex]?.events ?? [] : []) ids.set(event, `m3n-e-${++ordinal}`)
    }
  }
  const lyrics = lyricsByEvent(document)
  const groupForRange = (start: number, end: number) => groupForMeasures(
    part.melody.slice(start, end), part.bass.slice(start, end), lyrics, document.intervals, ids,
    {
      fromPrevious: part.melody[start - 1]?.ending !== undefined && part.melody[start - 1]?.ending === part.melody[start]?.ending,
      toNext: part.melody[end]?.ending !== undefined && part.melody[end]?.ending === part.melody[end - 1]?.ending,
    },
    keyBeforeMeasure(part.melody, start, document.key),
  )
  const measureRange = (start: number, end: number) => layoutVoiceGroup(
    groupForRange(start, end), 83, Number.POSITIVE_INFINITY,
  )

  // 1. Named `===` sections and `{br}` both split the score into independent
  // segments, each starting on a new system. A `{br}` marker lands on the
  // preceding measure (`breakAfter`) or the following one (`breakBefore`);
  // both denote the same boundary. Section names are stamped on the first
  // event of the section, so that measure also starts a segment.
  const segmentStarts = [0]
  for (let measure = 1; measure < measureCount; measure += 1) {
    const sectionBoundary = part.melody[measure]?.events.some((event) => event.sectionLabel !== undefined)
    if (part.melody[measure]?.breakBefore || part.melody[measure - 1]?.breakAfter || sectionBoundary) {
      segmentStarts.push(measure)
    }
  }
  segmentStarts.push(measureCount)

  const groups: VoiceGroup[] = []
  // Natural content budget per line: the renderer starts systems at 83 and
  // wraps when natural content passes `width - 77`, then stretches the line
  // across the page. This is the same conservative fit width the previous
  // wrapper used.
  const availableWidth = Math.max(1, width - 160)
  for (let segmentIndex = 0; segmentIndex < segmentStarts.length - 1; segmentIndex += 1) {
    const segmentStart = segmentStarts[segmentIndex]!
    const segmentEnd = segmentStarts[segmentIndex + 1]!
    const segmentLength = segmentEnd - segmentStart
    // 2. Render the segment by default and read its natural width. Measure
    // layout is additive, so each barline's x gives the natural width of the
    // range up to that measure.
    const segmentLayout = measureRange(segmentStart, segmentEnd)
    const naturalWidths = segmentLayout.lines[0]?.barlines.map((barline) => barline.x - 83) ?? []
    // A leading barline (e.g. `||:` on the first measure) is analyzed as
    // closing an empty zero-width measure, adding one extra barline. Keep
    // only the closing barline of each real measure so the balancing DP
    // sees exactly segmentLength measures.
    const prefixWidths = [0, ...naturalWidths.slice(-segmentLength)]
    const segmentWidth = segmentLayout.endX - 83
    // 3. The segment width decides how many lines are needed, then the
    // measures are split so every line carries an even share of that width.
    let lineCount = Math.max(1, Math.ceil(segmentWidth / availableWidth))
    lineCount = Math.min(lineCount, segmentLength)
    const lineSizes = balancedLineSizes(prefixWidths, lineCount)
    let start = segmentStart
    lineSizes.forEach((size) => {
      const end = start + size
      const group = groupForRange(start, end)
      const isFinalSegment = segmentIndex === segmentStarts.length - 2
      // Evenly distributed lines all stretch across the full width; the sole
      // line of the final segment keeps its natural width as a closing tail.
      if (!(isFinalSegment && lineSizes.length === 1)) group.forceJustify = true
      groups.push(group)
      start = end
    })
  }
  return groups
}

/** M3N's native numbered-notation score renderer. */
export class NumberedNotationScore {
  private constructor(private readonly document: ScoreDocument) {}

  static create(document: ScoreDocument) {
    return new NumberedNotationScore(document)
  }

  render(options: NumberedNotationRenderOptions) {
    const width = Math.max(320, Math.round(options.width))
    const groups = systemGroups(this.document, width)
    const metadata = {
      titles: [this.document.title, this.document.subtitle].filter(Boolean),
      authors: [this.document.singer || this.document.composer].filter(Boolean),
      mode: this.document.key,
      meters: [{ numerator: this.document.meterCount, denominator: this.document.meterUnit, parenthesized: false }],
      tempos: this.document.hasExplicitTempo ? [this.document.tempo] : [],
      instruments: [],
      remarks: [],
    }
    const baseConfig = createNumberedNotationLayout({ width, height: 300, musicFontCss: options.musicFontCss })
    const contentHeight = continuousPageHeight(groups, metadata, baseConfig, options.paged ? 12 : undefined)
    const a4PageHeight = Math.round(width * 1.415)
    const fitsOnOnePage = contentHeight <= a4PageHeight
    // Paged output always uses a full A4-height sheet even when the score is
    // shorter than one page; only continuous mode hugs the content height.
    const pageHeight = options.paged ? a4PageHeight : contentHeight
    const layout = createNumberedNotationLayout({ width, height: pageHeight, musicFontCss: options.musicFontCss })
    const numberedNotation: NumberedNotationDocument = {
      metadata,
      pages: options.paged && !fitsOnOnePage ? paginateVoiceGroups(groups, metadata, layout) : [{ index: 0, groups }],
    }
    return renderNumberedNotationPages(numberedNotation, layout)
  }
}
