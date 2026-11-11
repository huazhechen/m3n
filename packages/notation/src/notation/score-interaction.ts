import type { ScoreDocument, ScoreEvent, ScoreMeasure } from './score-document.js'
import { scoreEventIds } from '../score-event-ids.js'
import { measurePlaybackPasses, parsePassRange } from './repeats.js'
import { needsCjkSpacingCompensation, type MeiVerseSyllable } from './mei-lyrics.js'
import { scoreHeaderMetadata } from './mei-document.js'

export type ScoreSourceRange = { xmlId: string; sourceStart: number; sourceEnd: number }

/** Renderer-independent event/lyric interaction data. No XML is produced. */
export function deriveScoreInteraction(document: ScoreDocument) {
  const lyricsByEvent = new Map<ScoreEvent, MeiVerseSyllable[]>()
  const lyricSyllables = document.lyrics.map((block) => {
    const numericRange = /^\d+$/.test(block.range)
    const passRange = block.sharedPasses || block.range || block.phrasePasses
    const passes = passRange ? parsePassRange(passRange) : undefined
    const displayPass = !numericRange && passes?.size === 1 ? [...passes][0] : undefined
    return {
      n: numericRange ? block.range : String(displayPass ?? 1),
      verseIndex: numericRange ? Number(block.range) : displayPass ?? 1,
      targetStart: block.targetStart,
      targetEnd: block.targetEnd,
      passes,
      syllables: block.syllables.map((syllable) => ({
        ...syllable,
        passes,
        cjkSpacingCompensation: needsCjkSpacingCompensation(syllable.text),
      })),
    }
  })
  const melodyIndices = lyricSyllables.map(() => 0)
  const visibleVerseIndexes = new Set(lyricSyllables
    .filter((block) => block.syllables.some((syllable) => (
      syllable.kind === 'text' && syllable.text.replaceAll('~', '').trim() !== ''
    )))
    .map((block) => block.verseIndex))
  const lyricPassesByMeasure = new Map<ScoreMeasure, Set<number>>()
  for (const part of document.parts.values()) {
    for (const [measure, passes] of measurePlaybackPasses(part.melody)) lyricPassesByMeasure.set(measure, passes)
  }
  const isInstrumentalEvent = (event: ScoreEvent) => document.intervals.some((interval) => (
    interval.kind === 'inst' &&
    interval.staff === 'melody' &&
    interval.start !== undefined &&
    interval.end !== undefined &&
    interval.start <= event.sourceStart &&
    event.sourceEnd <= interval.end
  ))
  const compactLyricRowsInEnding = new Set<ScoreMeasure>()
  for (const part of document.parts.values()) {
    for (let index = 1; index < part.melody.length; index += 1) {
      const ending = part.melody[index]
      const previous = part.melody[index - 1]
      if (!ending?.ending || !previous?.ending || ending.ending === previous.ending) continue
      const laterCommonUsesMultipleRows = part.melody.slice(index).some((measure) => (
        !measure?.ending && measure?.events.some((event) => Math.max(0, ...lyricSyllables
          .filter((block) => block.targetStart === undefined || (
            block.targetStart <= event.sourceStart && event.sourceStart < (block.targetEnd ?? Infinity)
          ))
          .map((block) => block.verseIndex)) > 1)
      ))
      if (laterCommonUsesMultipleRows) continue
      for (let endingIndex = index; part.melody[endingIndex]?.ending === ending.ending; endingIndex += 1) {
        compactLyricRowsInEnding.add(part.melody[endingIndex]!)
      }
    }
  }

  for (const part of document.parts.values()) {
    let tieEnd = false
    for (const measure of part.melody) {
      for (const event of measure.events) {
        const staffNumber = 1
        const lyricTargetCount = event.kind === 'tuplet'
          ? event.pitches.filter((pitch) => pitch !== '0').length
          : 1
        const measurePasses = measure ? lyricPassesByMeasure.get(measure) : undefined
        const lyricBlocksAtEvent = lyricSyllables.filter((block) => (
          (block.targetStart === undefined || block.targetStart <= event.sourceStart)
          && (block.targetEnd === undefined || event.sourceStart < block.targetEnd)
          && (!block.passes || !measurePasses || [...measurePasses].some((pass) => block.passes?.has(pass)))
        ))
        const hasVisibleLyricText = (syllable: { kind: string; text: string }) => (
          syllable.kind === 'text' && syllable.text.replaceAll('~', '').trim() !== ''
        )
        const textRowsAtEvent = new Set(lyricBlocksAtEvent
          .filter((block) => block.syllables.some(hasVisibleLyricText))
          .map((block) => block.verseIndex))
        const activeLyricBlocks = lyricBlocksAtEvent.filter((block) => textRowsAtEvent.has(block.verseIndex))
        const hasLyricTarget = staffNumber === 1 && event.kind !== 'rest' && !isInstrumentalEvent(event)
        const assignedLyrics = hasLyricTarget
          ? activeLyricBlocks.flatMap((block) => Array.from({ length: lyricTargetCount }, (_, targetIndex) => {
            const index = lyricSyllables.indexOf(block)
            const lyricIndex = melodyIndices[index] ?? 0
            const lyric = block.syllables[lyricIndex]
            const tiedTarget = targetIndex === 0 && tieEnd
            if (!lyric || lyric.forceTiedTarget !== tiedTarget) return []
            melodyIndices[index] = lyricIndex + 1
            return { ...lyric, n: block.n, verseIndex: block.verseIndex }
          }).flat())
          : []
        const lyrics = hasLyricTarget
          ? activeLyricBlocks.flatMap((block) => {
            const matched = assignedLyrics.filter((lyric) => lyric.verseIndex === block.verseIndex)
            if (matched.length > 0) return matched
            return [{
              text: '',
              sourceStart: event.sourceStart,
              sourceEnd: event.sourceEnd,
              forceTiedTarget: false,
              kind: 'placeholder' as const,
              underlined: false,
              n: block.n,
              verseIndex: block.verseIndex,
              passes: block.passes,
              cjkSpacingCompensation: false,
            }]
          })
          : []
        if (hasLyricTarget && !measure?.ending) {
          const occupiedRows = new Set(lyrics.map((lyric) => lyric.verseIndex))
          const reservesForcedCjkSpace = lyrics.some((lyric) => lyric.forceTiedTarget && needsCjkSpacingCompensation(lyric.text))
          if (reservesForcedCjkSpace) {
            for (const lyric of lyrics) {
              if (lyric.kind === 'placeholder') lyric.cjkSpacingCompensation = true
            }
          }
          const partLyricRowCount = Math.max(0, ...textRowsAtEvent)
          for (let row = 1; row <= partLyricRowCount; row += 1) {
            if (occupiedRows.has(row)) continue
            lyrics.push({
              text: '',
              sourceStart: event.sourceStart,
              sourceEnd: event.sourceEnd,
              forceTiedTarget: false,
              kind: 'placeholder',
              underlined: false,
              n: String(row),
              verseIndex: row,
              passes: undefined,
              cjkSpacingCompensation: reservesForcedCjkSpace,
            })
          }
          lyrics.sort((left, right) => left.verseIndex - right.verseIndex)
        }
        if (measure && compactLyricRowsInEnding.has(measure)) {
          const visualRows = new Map<number, number>()
          for (const lyric of lyrics) {
            const row = visualRows.get(lyric.verseIndex) ?? visualRows.size + 1
            visualRows.set(lyric.verseIndex, row)
            lyric.n = String(row)
            lyric.verseIndex = row
          }
        }
        lyricsByEvent.set(event, lyrics)
        tieEnd = event.tie
      }
    }
  }
  const ids = scoreEventIds(document)
  const sourceMap: ScoreSourceRange[] = []
  const hasBassStaff = [...document.parts.values()].some(part => part.bass.some(measure => measure.events.length > 0))
  for (const part of document.parts.values()) {
    const count = Math.max(part.melody.length, hasBassStaff ? part.bass.length : 0)
    for (let index = 0; index < count; index += 1) {
      for (const measure of [part.melody[index], ...(hasBassStaff ? [part.bass[index]] : [])]) {
        for (const event of measure?.events ?? []) {
          const xmlId = ids.get(event)!
          sourceMap.push({ xmlId, sourceStart: event.sourceStart, sourceEnd: event.sourceEnd })
          if (event.kind === 'tuplet') event.pitches.forEach((_, slot) => sourceMap.push({ xmlId: `${xmlId}-n${slot + 1}`, sourceStart: event.sourceStart, sourceEnd: event.sourceEnd }))
          for (const lyric of lyricsByEvent.get(event) ?? []) sourceMap.push({ xmlId, sourceStart: lyric.sourceStart, sourceEnd: lyric.sourceEnd })
        }
      }
    }
  }
  return { lyricsByEvent, visibleVerseIndexes, sourceMap, hasBassStaff, headerMetadata: scoreHeaderMetadata(document) }
}
export type ScoreInteraction = ReturnType<typeof deriveScoreInteraction>
