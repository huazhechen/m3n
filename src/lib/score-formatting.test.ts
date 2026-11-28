import { readFileSync } from 'node:fs'
import type { ScoreMeasure } from '@m3n/notation'
import { formatM3N, normalizeSectionBarlines, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import { describe, expect, it } from 'vitest'

// Syntax edge cases live in notation/m3n-format and formatting/stages.
// Keep distinct real arrangements here; corpus validity/content and both
// notation projections have their own complete-library contracts.
const cases = ([
  ['ban_yin_jie_kou_qin_ji_ben_gong_01.m3n', 'long exercises and explicit breaks'],
  ['badinerie_bwv1067_01.m3n', 'dense rhythms'],
  ['dan_huang_guan_bo_er_ka_01.m3n', 'tuplet expressions'],
  ['flower_dance_01.m3n', 'instrumental navigation'],
  ['mozart_k545_01.m3n', 'long classical arrangement'],
  ['turkish_march_01.m3n', 'repeats and inline controls'],
  ['ming_tian_hui_geng_hao_01.m3n', 'repeated verses'],
  ['liang_liang_01.m3n', 'lyrics and tied events'],
  ['guo_huo_01.m3n', 'lyric alignment'],
  ['qiu_ying_01.m3n', 'lyric phrasing'],
  ['you_raise_me_up_01.m3n', 'English lyrics and repeated transposed visits'],
  ['valsentino_01.m3n', 'chromatic instrumental music'],
] as const).map(([file, feature]) => ({ file, feature, source: readFileSync(new URL(`../scores/${file}`, import.meta.url), 'utf8') }))

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
    intervals: score.intervals.map(({ kind, staff, start, endStart, tempoTarget, display }) =>
      ({ kind, staff, start: times.get(start!)?.start, end: times.get(endStart!)?.end, tempoTarget, display })),
    lyrics: score.lyrics.map((block) => block.syllables.map(({ text, kind, underlined, forceTiedTarget, wordpos }) =>
      ({ text, kind, underlined, forceTiedTarget, wordpos }))),
  }
}

describe('representative score formatting integration', () => {
  it.each(['turkish_march_01.m3n', 'second_waltz_01.m3n'])('retains the required opening repeat in %s', file => {
    const source = readFileSync(new URL(`../scores/${file}`, import.meta.url), 'utf8')
    const repeatStarts = (text: string) => [...parseM3NDocument(text).parts.values()]
      .flatMap(part => part.melody).flatMap((bar, index) => bar.left === 'rptstart' ? [index] : [])
    const before = repeatStarts(source)
    expect(before.length).toBeGreaterThan(0)
    expect(repeatStarts(formatM3N(source))).toEqual(before)
  })
  it.each(cases)('preserves music, lyrics, validity and stability: $file ($feature)', ({ source }) => {
    const formatted = formatM3N(source)
    expect(validateM3NDiagnostics(formatted).map(({ code, message }) => ({ code, message })))
      .toEqual(validateM3NDiagnostics(source).map(({ code, message }) => ({ code, message })))
    const canonical = normalizeSectionBarlines(source)
    expect(musicalMeaning(formatted)).toEqual(musicalMeaning(canonical))
    expect(formatM3N(formatted)).toBe(formatted)
  })
})
