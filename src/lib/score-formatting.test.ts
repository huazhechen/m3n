import { describe, expect, it } from 'vitest'
import { formatM3N,  normalizeSectionBarlines, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import type { ScoreMeasure } from '@m3n/notation'

const sources = import.meta.glob<string>('../scores/*.m3n', { eager: true, query: '?raw', import: 'default' })

/** Preserve every engraved event, including separate tied notes and rests. */
function musicalMeaning(source: string) {
  const score = parseM3NDocument(source)
  const times = new Map<number, { start: number; end: number }>()
  const staffMeaning = (measures: ScoreMeasure[]) => {
    const pitches = resolveScorePitches(measures)
    let elapsed = 0
    return measures.map((measure) => {
      const spans = []
      for (const event of measure.events) {
        times.set(event.sourceStart, { start: elapsed, end: elapsed + event.beats })
        elapsed += event.beats
        const { sourceStart: _start, sourceEnd: _end, ...engraved } = event
        spans.push({ ...engraved, resolvedPitches: pitches.get(event) ?? [] })
      }
      return { spans, left: measure.left, right: measure.right, ending: measure.ending, repeatCount: measure.repeatCount, breakBefore: measure.breakBefore, breakAfter: measure.breakAfter }
    })
  }
  return {
    title: score.title, key: score.key, meter: [score.meterCount, score.meterUnit], tempo: score.tempo, order: score.order, orderKeys: score.orderKeys, orderKeyOctaves: score.orderKeyOctaves,
    parts: [...score.parts].map(([name, part]) => [name, staffMeaning(part.melody), staffMeaning(part.bass)]),
    alternatives: score.alternatives?.map((alternative) => [alternative.passes, staffMeaning([alternative.measure])]),
    intervals: score.intervals.map(({ kind, staff, start, endStart, tempoTarget, display }) =>
      ({ kind, staff, start: times.get(start!)?.start, end: times.get(endStart!)?.end, tempoTarget, display })),
    lyrics: score.lyrics.map((block) => block.syllables.map(({ text, kind, underlined, forceTiedTarget, wordpos }) =>
      ({ text, kind, underlined, forceTiedTarget, wordpos }))),
  }
}

describe('score formatting corpus', () => {
  it.each(Object.entries(sources))('preserves music, lyrics, validity and stability: %s', (_, source) => {
    const formatted = formatM3N(source)
    expect(validateM3NDiagnostics(formatted).map(({ code, message }) => ({ code, message })))
      .toEqual(validateM3NDiagnostics(source).map(({ code, message }) => ({ code, message })))
    const canonical = normalizeSectionBarlines(source)
    expect(musicalMeaning(formatted)).toEqual(musicalMeaning(canonical))
    expect(formatM3N(formatted)).toBe(formatted)
  })
})
