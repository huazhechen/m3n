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
    ['yang_cong', onion, 'C', 22, 180, 'pop'],
    ['tu_ran_hao_xiang_ni', sudden, 'D', 69, 304, 'pop'],
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

  it('sings Onion verses 1–2, chorus, verse 3, chorus with the original lyric wording', () => {
    expect(parseM3NDocument(onion).order).toEqual(['引子', '主歌', '主歌', '副歌', '主歌', '副歌'])
    expect(performedWords(onion)).toBe(reference.onionPerformedLyrics)
  })

  it('matches the complete Suddenly Missing You lyrics and preserves its 71 qpm intro and coda', () => {
    const document = parseM3NDocument(sudden)
    expect(document.tempo).toBe(71)
    expect(document.composer).toBe('陈信宏')
    expect(performedWords(sudden)).toBe(reference.suddenPerformedLyrics)
    expect(sudden).not.toContain('眼晴')
    expect(document.intervals.some(interval => interval.kind === 'rit' && interval.tempoTarget === 48)).toBe(true)
  })
})
