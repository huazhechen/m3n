import { compileScorePerformance, deriveScoreInteraction, formatM3N, parseM3NDocument, resolveScorePitches, scoreEventIds, validateM3NDiagnostics } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import badinerie from '../scores/badinerie_bwv1067_01.m3n?raw'
import onion from '../scores/yang_cong_01.m3n?raw'
import sudden from '../scores/tu_ran_hao_xiang_ni_01.m3n?raw'
import reference from './fixtures/uploaded-three-scores.json'
import plan from '../../config/scorebook/editorial-plan.json'
import categories from '../../config/scorebook/library-categories.json'

function performedWords(source: string) {
  const document = parseM3NDocument(source)
  const lyrics = deriveScoreInteraction(document).lyricsByEvent
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyrics.get(event) ?? []]))
  const seen = new Set<string>()
  return compileScorePerformance(document).elements.filter(event => event.voice === 'score:melody').flatMap(event => {
    // A tuplet emits several playback elements under one source event identity.
    const key = `${event.xmlId}:${event.rendition}`
    if (seen.has(key)) return []
    seen.add(key)
    return (byId.get(event.xmlId) ?? []).filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(event.rendition))).map(lyric => lyric.text)
  }).join('')
}

describe('three scores transcribed from the November 26 uploads', () => {
  it.each([
    ['badinerie_bwv1067', badinerie, 'Bm', 42, 160, 'instrumental'],
    ['yang_cong', onion, 'C', 28, 180, 'pop'],
    ['tu_ran_hao_xiang_ni', sudden, 'D', 52, 231, 'pop'],
  ] as const)('validates, formats and catalogs %s with melody only', (id, source, key, count, beats, category) => {
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(formatM3N(source)).toBe(source)
    const document = parseM3NDocument(source)
    expect(document.key).toBe(key)
    expect(document.parts.get('score')!.bass.flatMap(bar => bar.events)).toEqual([])
    expect(document.parts.get('score')!.melody.filter(bar => bar.events.length)).toHaveLength(count)
    expect(compileScorePerformance(document).beats).toBe(beats)
    expect(categories.find(item => item.id === category)!.files).toContain(`${id}_01.m3n`)
    expect(plan.entries.find(item => item.id === id)).toMatchObject({ file: `${id}_01.m3n`, section: category })
    expect(plan.sourceCount).toBe(plan.entries.length)
  })

  it('keeps the Badinerie octave register and both complementary repeated halves', () => {
    const document = parseM3NDocument(badinerie)
    const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
    const pitches = resolveScorePitches(bars)
    expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0)))
      .toEqual(Array.from({ length: 42 }, (_, index) => [0, 16, 17, 41].includes(index) ? 1 : 2))
    const notes = (index: number) => bars[index]!.events.map(event => [pitches.get(event)?.[0], event.beats])
    // Uploaded top line; opening pitches/onsets also checked against Flutetunes MIDI.
    expect(notes(0)).toEqual([['b:5:', .5], ['d:6:', .25], ['b:5:', .25]])
    expect(notes(1)).toEqual([['f:5:s', .5], ['b:5:', .25], ['f:5:s', .25], ['d:5:', .5], ['f:5:s', .25], ['d:5:', .25]])
    expect(notes(2)).toEqual([['b:4:', 1], ['f:4:s', .25], ['b:4:', .25], ['d:5:', .25], ['b:4:', .25]])
    expect(notes(18)).toEqual([['c:5:s', .5], ['f:5:s', .25], ['c:5:s', .25], ['a:4:', .5], ['c:5:s', .25], ['a:4:', .25]])
    expect(notes(19)).toEqual([['f:4:s', 1], ['c:5:n', .5], ['b:4:', .5]])
    expect(bars.filter(bar => bar.left === 'rptstart')).toHaveLength(2)
    expect(bars.flatMap(bar => bar.events).every(event => event.pitches.length === 1)).toBe(true)
  })

  it('follows the complete independent Badinerie solo line across all registers', () => {
    const document = parseM3NDocument(badinerie)
    const bars = document.parts.get('score')!.melody
    const pitches = resolveScorePitches(bars)
    const semitones: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
    const accidentals: Record<string, number> = { '': 0, n: 0, s: 1, f: -1, ss: 2, ff: -2 }
    const actual: number[][] = []
    let beat = 0, tied = false
    for (const event of bars.flatMap(bar => bar.events)) {
      const [name, octave, accidental] = pitches.get(event)![0]!.split(':')
      if (!tied) actual.push([beat, 12 * (Number(octave) + 1) + semitones[name!]! + accidentals[accidental!]!])
      beat += event.beats
      tied = event.tie
    }
    expect(actual).toEqual(reference.badinerieSoloReference.notes)
  })

  it('sings Onion verses 1–2, chorus, verse 3, chorus with the original lyric wording', () => {
    const document = parseM3NDocument(onion)
    expect(document.order).toBeUndefined()
    expect(document.parts.get('score')!.melody.filter(bar => bar.left === 'rptstart')).toHaveLength(1)
    expect(performedWords(onion)).toBe(reference.onionPerformedLyrics)
  })

  it.each([onion, sudden, badinerie])('uses slurs only for phrases containing different pitches', source => {
    const document = parseM3NDocument(source)
    const events = document.parts.get('score')!.melody.flatMap(bar => bar.events)
    for (const interval of document.intervals.filter(interval => interval.kind === 'lg')) {
      const phrase = events.filter(event => event.sourceStart >= interval.start! && event.sourceStart < interval.end!)
      expect(new Set(phrase.flatMap(event => event.pitches)).size).toBeGreaterThan(1)
    }
  })

  it('holds a sung syllable instead of anticipating the next syllable with a slide note', () => {
    const document = parseM3NDocument(sudden)
    const events = document.parts.get('score')!.melody.flatMap(bar => bar.events)
    const lyrics = deriveScoreInteraction(document).lyricsByEvent
    for (let index = 1; index < events.length - 1; index++) {
      const previous = events[index - 1]!, event = events[index]!, next = events[index + 1]!
      if (previous.tie || !lyrics.get(event)?.some(lyric => lyric.kind === 'placeholder')) continue
      if (!lyrics.get(next)?.some(lyric => lyric.kind === 'text')) continue
      expect(event.pitches).not.toEqual(next.pitches)
    }
    const thought = events.filter(event => lyrics.get(event)?.some(lyric => lyric.text === '想') && event.pitches[0] === '3e')
    expect(thought).toHaveLength(4)
    expect(thought.map(event => event.beats)).toEqual([1, 1, 1, 1])
  })

  it('marks the remaining sung melismas with a slur across their different pitches', () => {
    const document = parseM3NDocument(sudden)
    const events = document.parts.get('score')!.melody.flatMap(bar => bar.events)
    const lyrics = deriveScoreInteraction(document).lyricsByEvent
    for (let start = 0; start < events.length; start++) {
      if (!lyrics.get(events[start]!)?.some(lyric => lyric.kind === 'text')) continue
      let end = start
      while (end + 1 < events.length && events[end + 1]!.kind !== 'rest'
        && lyrics.get(events[end + 1]!)?.some(lyric => lyric.kind === 'placeholder')
        && !lyrics.get(events[end + 1]!)?.some(lyric => lyric.kind === 'text')) end++
      while (end > start && events[end - 1]!.tie) end--
      if (new Set(events.slice(start, end + 1).flatMap(event => event.pitches)).size < 2) continue
      expect(document.intervals.some(interval => interval.kind === 'lg'
        && interval.start! <= events[start]!.sourceStart && interval.end! >= events[end]!.sourceEnd)).toBe(true)
    }
  })

  it('matches the complete Suddenly Missing You lyrics and keeps only its 71 qpm vocal line with an interlude sign', () => {
    const document = parseM3NDocument(sudden)
    expect(document.tempo).toBe(71)
    expect(document.composer).toBe('陈信宏')
    expect(performedWords(sudden)).toBe(reference.suddenPerformedLyrics)
    expect(sudden).not.toContain('眼晴')
    expect(document.parts.get('score')!.melody.filter(bar => bar.interlude)).toHaveLength(1)
    expect(document.intervals.some(interval => interval.kind === 'inst' || interval.kind === 'rit')).toBe(false)
  })
})
