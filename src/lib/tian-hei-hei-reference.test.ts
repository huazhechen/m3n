import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import source from '../scores/tian_hei_hei_01.m3n?raw'
import expandedReference from './fixtures/tian-hei-hei-before-repeats.m3n?raw'

// The linear transcription is retained as a reference. The user requested the
// first refrain's melody on both passes; three opening rest beats let the
// pickups sit inside ordinary repeats without alternate endings.
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
  it('uses two nonnested repeats and one shared interlude in 49 numbered measures without alternate endings', () => {
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(document).toMatchObject({ key: 'Ab', meterCount: 4, meterUnit: 4, tempo: 112 })
    const written = document.parts.get('score')!.melody.filter(bar => bar.events.length || bar.interlude)
    expect(written.filter(bar => bar.events.length)).toHaveLength(49)
    expect(written[11]).toMatchObject({ events: [{ pitches: [], beats: 4 }] })
    expect(written[11]!.interlude).toBeUndefined()
    expect(written.filter(bar => bar.interlude)).toHaveLength(1)
    expect(written.filter(bar => bar.left === 'rptstart')).toHaveLength(1)
    expect(written.filter(bar => bar.right === 'rptend')).toHaveLength(2)
    expect(document.order).toBeUndefined()
    expect(source).toContain('L1: 小时候吵闹')
    expect(source).toContain('L2: 小时候有了')
    expect(written.at(-1)!.right).toBe('end')
    expect(written.at(-1)!.events.map(event => event.pitches.join(',') || '0')).toEqual(['0', '4', '5'])
  })

  it('preserves every performed pitch, octave, rhythm, tie and ordinary rest from the normalized reference', () => {
    expect(performed.slice(3).map(eventSignature)).toEqual(expectedEvents.map(eventSignature))
    const performance = compileScorePerformance(document)
    expect(performance.beats).toBe(320)
    expect(performance.elements).toHaveLength(expectedEvents.length + 3)
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
    expect(actual.slice(0, 3)).toEqual(['', '', ''])
    expect(actual.slice(3)).toEqual(expected)
  })

  it('fills every written measure and includes both pickups inside ordinary repeats', () => {
    const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
    for (const bar of bars) {
      expect(bar.events.reduce((sum, event) => sum + event.beats, 0)).toBe(4)
    }
    expect(document.parts.get('score')!.melody.some(bar => bar.ending)).toBe(false)
    const repeatStarts = bars.filter((bar, index) => index === 0 || bar.left === 'rptstart')
    expect(repeatStarts.map(bar => bar.events.map(event => event.pitches.join(',') || '0')))
      .toEqual([['0', '0', '0', '3', '4'], ['0', '0', '0', '5', '2e', '1e']])
    expect(source).toContain('L1: 我的\nL2: 离开')
    expect(performed.slice(0, 3).map(event => [event.pitches, event.beats]))
      .toEqual([[[], 1], [[], 1], [[], 1]])
  })

  it('skips the shared interlude on both passes and ends on the last vocal refrain', () => {
    expect(source).not.toContain('{inst}')
    const performance = compileScorePerformance(document)
    expect(performance.elements[0]!.start).toBe(0)
    expect(performance.elements.at(-1)!.end).toBe(performance.beats)
    expect(unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.interlude)).toHaveLength(2)
  })
})
