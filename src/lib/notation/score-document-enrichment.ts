import { parseLyricItems } from './lyrics'
import { tokenizeM3N } from './m3n-tokens'
import type { M3NDocumentProjection } from './m3n-document'
import type { ScoreDocument, ScoreLyricBlock } from './score-document'

/** Applies source-aware phrase metadata after the score state machine is built. */
export function enrichScoreDocument(document: ScoreDocument, originalSource: string, projection: M3NDocumentProjection) {
  if (projection.structure.sections.length === 0) return document

  const tokens = tokenizeM3N(originalSource)
  const sourcePositions = new Map<number, number>()
  const regions = (staff: 'melody' | 'bass') => projection.structure.sections.flatMap((section) =>
    section.phrases.flatMap((phrase) => {
      const row = staff === 'melody' ? phrase.melody : phrase.bass
      return row ? [{ start: row.start, end: row.start + row.text.length }] : []
    }))
  const remapStaff = (staff: 'melody' | 'bass') => {
    const ranges = regions(staff)
    const atomTokens = tokens.filter((token) => (token.kind === 'note' || token.kind === 'group') &&
      ranges.some((range) => range.start <= token.start && token.start < range.end))
    const events = [...document.parts.values()].flatMap((part) => part[staff].flatMap((measure) => measure.events))
    for (const [index, event] of events.entries()) {
      const token = atomTokens[index]
      if (!token) continue
      sourcePositions.set(event.sourceStart, token.start)
      sourcePositions.set(event.sourceEnd, token.start + token.raw.length)
      event.sourceStart = token.start
      event.sourceEnd = token.start + token.raw.length
    }
  }
  remapStaff('melody')
  remapStaff('bass')
  for (const interval of document.intervals) {
    if (interval.start !== undefined) interval.start = sourcePositions.get(interval.start) ?? interval.start
    if (interval.endStart !== undefined) interval.endStart = sourcePositions.get(interval.endStart) ?? interval.endStart
    if (interval.end !== undefined) interval.end = sourcePositions.get(interval.end) ?? interval.end
  }

  const score = document.parts.get('score')
  if (!score) return document
  for (const section of projection.structure.sections) {
    for (const phrase of section.phrases) {
      if (!phrase.melody || !phrase.harmony) continue
      const melodyEnd = phrase.melody.start + phrase.melody.text.length
      const measures = score.melody.filter((measure) => measure.events.some((event) =>
        phrase.melody!.start <= event.sourceStart && event.sourceStart < melodyEnd))
      for (const [measureIndex, harmony] of phrase.harmony.text.split(/\|+/).entries()) {
        const events = measures[measureIndex]?.events ?? []
        if (events.length === 0) continue
        let depth = 0
        let offset = 0
        for (const token of harmony.matchAll(/\(|\)|(?:VII|III|II|IV|VI|V|I|vii|iii|ii|iv|vi|v|i)(?:m|dim|aug|sus2|sus4|maj7|maj9|[2-9]|1[0-3])?/g)) {
          const value = token[0]
          if (value === '(') { depth += 1; continue }
          if (value === ')') { depth = Math.max(0, depth - 1); continue }
          let elapsed = 0
          const target = events.find((event) => {
            const matches = elapsed + 1e-9 >= offset
            elapsed += event.beats
            return matches
          }) ?? events.at(-1)
          if (target) { target.chord = value; target.chordState = value }
          offset += (events[0]?.meterCount ?? document.meterCount) * 4 /
            (events[0]?.meterUnit ?? document.meterUnit) / 2 ** depth
        }
      }
    }
  }

  const lyrics: ScoreLyricBlock[] = []
  for (const section of projection.structure.sections) for (const phrase of section.phrases) {
    if (!phrase.melody) continue
    for (const lyric of phrase.lyrics) {
      if (/^\{L(\d+)\}$/.test(lyric.text.trim())) continue
      lyrics.push({
        range: lyric.label,
        mode: 'char',
        syllables: parseLyricItems(lyric.text.replace(/\s*\|\s*/g, ' '), lyric.start),
        phrasePasses: phrase.passes || undefined,
        targetStart: phrase.melody.start,
        targetEnd: phrase.melody.start + phrase.melody.text.length,
      })
    }
  }
  document.lyrics = lyrics
  for (const section of projection.structure.sections) {
    const melody = section.phrases.find((phrase) => phrase.melody)?.melody
    if (!section.name || !melody) continue
    const end = melody.start + melody.text.length
    const event = score.melody.flatMap((measure) => measure.events)
      .find((candidate) => melody.start <= candidate.sourceStart && candidate.sourceStart < end)
    if (event) event.sectionLabel = section.name
  }
  return document
}
