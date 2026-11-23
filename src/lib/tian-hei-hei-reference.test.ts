import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import source from '../scores/tian_hei_hei_01.m3n?raw'
import expandedReference from './fixtures/tian-hei-hei-before-repeats.m3n?raw'

// The linear transcription is retained as a reference. The user requested the
// first refrain's melody on both passes, with only the final pickup bar differing.
const normalizedReference = expandedReference.replace(
  'N: 5 1 3b^~ |\nL: 欲落雨\n---\nN: 3b 0 0 0 |\n---\nN: 5 4 5 0 |\nL: 天黑黑\n---\nN: 0 4 5^~ |\nL: 黑黑\n---\nN: 5^ (0 5) (2e 1e) |',
  'N: 5 1 3b^ |\nL: 欲落雨\n---\nN: 0^^ |\n---\nN: 5 4 5^ |\nL: 天黑黑\n---\nN: 0 4 5^ |\nL: 黑黑\n---\nN: 0 0 (0 5) (2e 1e) |',
).replaceAll('N: 0^. (3 4) |', 'N: 0 0 0 (3 4) |')
  .replace('N: 0^ (0 5) (2e 1e) |', 'N: 0 0 (0 5) (2e 1e) |')
const document = parseM3NDocument(source)
const reference = parseM3NDocument(normalizedReference)
const referenceBars = reference.parts.get('score')!.melody.filter(bar => bar.events.length)
const expectedEvents = referenceBars.slice(0, 87).flatMap((bar, index) => {
  const number = index + 1
  if (number >= 46 && number <= 52) return []
  return bar.events
})
const performed = unfoldScorePerformance(document).parts.get('score')!.melody.flatMap(bar => bar.events)
const eventSignature = (event: typeof performed[number]) => [event.pitches.join(',') || '0', event.beats, event.tie, event.key]

describe('Tian Hei Hei, compact EasyPiano vocal edition', () => {
  it('uses two nonnested repeats and two unmeasured passages in 51 numbered measure positions', () => {
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(document).toMatchObject({ key: 'Ab', meterCount: 4, meterUnit: 4, tempo: 112 })
    const written = document.parts.get('score')!.melody.filter(bar => bar.events.length || bar.interlude)
    expect(written.filter(bar => bar.events.length)).toHaveLength(51)
    expect(written[11]).toMatchObject({ events: [{ pitches: [], beats: 4 }] })
    expect(written[11]!.interlude).toBeUndefined()
    expect(written.filter(bar => bar.interlude)).toHaveLength(2)
    expect(written.filter(bar => bar.left === 'rptstart')).toHaveLength(2)
    expect(written.filter(bar => bar.right === 'rptend')).toHaveLength(2)
    expect(document.order).toBeUndefined()
    expect(source).toContain('L1: 小时候吵闹')
    expect(source).toContain('L2: 小时候有了')
    expect(written.at(-1)!.right).toBe('end')
    expect(written.at(-1)!.events.map(event => event.pitches.join(',') || '0')).toEqual(['0', '4', '5'])
  })

  it('preserves every performed pitch, octave, rhythm, tie and ordinary rest from the normalized reference', () => {
    expect(performed.map(eventSignature)).toEqual(expectedEvents.map(eventSignature))
    const performance = compileScorePerformance(document)
    expect(performance.beats).toBe(317)
    expect(performance.elements).toHaveLength(expectedEvents.length)
    expect(performance.notes.map(note => [note.pitch, note.end - note.start]))
      .toEqual(compileScorePerformance(reference).notes.map(note => [note.pitch, note.end - note.start]))
  })

  it('sings the correct lyrics on both verse passes and both chorus passes', () => {
    const referenceLyrics = deriveScoreInteraction(reference).lyricsByEvent
    const lyrics = deriveScoreInteraction(document).lyricsByEvent
    const ids = scoreEventIds(document)
    const byId = new Map([...ids].map(([event, id]) => [id, event]))
    const actual = compileScorePerformance(document).elements.map(element => {
      const event = byId.get(element.xmlId)!
      return (lyrics.get(event) ?? []).filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
        .map(lyric => lyric.text).join('')
    })
    const expected = expectedEvents.map(event => (referenceLyrics.get(event) ?? [])
      .filter(lyric => lyric.kind === 'text').map(lyric => lyric.text).join(''))
    expect(actual).toEqual(expected)
  })

  it('fills every measure after the opening pickup and limits the first endings to one bar each', () => {
    const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(bars[0]!.events.reduce((sum, event) => sum + event.beats, 0)).toBe(1)
    for (const bar of bars.slice(1)) {
      expect(bar.events.reduce((sum, event) => sum + event.beats, 0)).toBe(4)
    }
    const endings = bars.filter(bar => bar.ending)
    expect(endings.slice(0, 2).map(bar => bar.events.map(event => event.pitches.join(',') || '0')))
      .toEqual([['0', '0', '0', '3', '4'], ['0', '0', '0', '5', '2e', '1e']])
  })

  it('skips both unmeasured interludes and ends on the last vocal refrain', () => {
    expect(source).not.toContain('{inst}')
    const performance = compileScorePerformance(document)
    expect(performance.elements[0]!.start).toBe(0)
    expect(performance.elements.at(-1)!.end).toBe(performance.beats)
    expect(unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.interlude)).toHaveLength(2)
  })
})
