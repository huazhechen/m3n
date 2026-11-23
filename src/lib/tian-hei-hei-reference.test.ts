import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import source from '../scores/tian_hei_hei_01.m3n?raw'
import expandedReference from './fixtures/tian-hei-hei-before-repeats.m3n?raw'

// The previous linear transcription was checked against EasyPiano P.1 and P.2.
// Only instrumental waiting is removed: bar 12, bars 46–52, prefixes of bars
// 15/53/70, and the outro (88–92). Every vocal event remains unchanged.
const document = parseM3NDocument(source)
const reference = parseM3NDocument(expandedReference)
const referenceBars = reference.parts.get('score')!.melody.filter(bar => bar.events.length)
const expectedEvents = referenceBars.slice(0, 87).flatMap((bar, index) => {
  const number = index + 1
  if (number === 12 || (number >= 46 && number <= 52)) return []
  return [15, 53, 70].includes(number) ? bar.events.slice(1) : bar.events
})
const performed = unfoldScorePerformance(document).parts.get('score')!.melody.flatMap(bar => bar.events)
const eventSignature = (event: typeof performed[number]) => [event.pitches.join(',') || '0', event.beats, event.tie, event.key]

describe('Tian Hei Hei, compact EasyPiano vocal edition', () => {
  it('uses two nonnested repeats and four unmeasured passages in 55 numbered measure positions', () => {
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(document).toMatchObject({ key: 'Ab', meterCount: 4, meterUnit: 4, tempo: 112 })
    const written = document.parts.get('score')!.melody.filter(bar => bar.events.length || bar.interlude)
    expect(written.filter(bar => bar.events.length)).toHaveLength(55)
    expect(written.filter(bar => bar.interlude)).toHaveLength(4)
    expect(written.filter(bar => bar.left === 'rptstart')).toHaveLength(2)
    expect(written.filter(bar => bar.right === 'rptend')).toHaveLength(2)
    expect(document.order).toBeUndefined()
    expect(source).toContain('L1: 小时候吵闹')
    expect(source).toContain('L2: 小时候有了')
    expect(written.at(-1)!.right).toBe('end')
    expect(written.at(-1)!.events.map(event => event.pitches.join(',') || '0')).toEqual(['0', '4', '5'])
  })

  it('preserves every performed pitch, octave, rhythm, tie and ordinary rest from the approved reference', () => {
    expect(performed.map(eventSignature)).toEqual(expectedEvents.map(eventSignature))
    const performance = compileScorePerformance(document)
    expect(performance.beats).toBe(305)
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

  it('skips all four interludes and ends on the last vocal refrain', () => {
    expect(source).not.toContain('{inst}')
    const performance = compileScorePerformance(document)
    expect(performance.elements[0]!.start).toBe(0)
    expect(performance.elements.at(-1)!.end).toBe(performance.beats)
    expect(unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.interlude)).toHaveLength(4)
  })
})
