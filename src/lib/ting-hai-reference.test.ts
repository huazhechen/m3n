import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import source from '../scores/ting_hai_01.m3n?raw'
import reference from './fixtures/ting-hai-upload-reference.json'

// Keep the full uploaded transcription intact. The user subsequently removed
// all instrumental introduction notes, retaining only the one-beat vocal pickup.
// The final sustained note is shortened by one beat to complement that pickup.
const expectedBars = reference.bars.slice(7).map((bar, index) => index === reference.bars.length - 8 ? {
  ...bar, events: [['1e', 3, false]],
} : index ? bar : {
  ...bar, events: bar.events.slice(1), lyrics: bar.lyrics.slice(1),
})

const document = parseM3NDocument(source)
const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
const events = (bar: typeof bars[number]) => bar.events.map(event => [
  event.pitches.join(',') || '0', event.beats, event.tie ?? false,
])

describe('Ting Hai uploaded reference d72b', () => {
  it('matches every printed pitch, octave, duration, rest and tie, after removing the instrumental introduction', () => {
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(document.key).toBe(reference.key)
    expect(document.tempo).toBe(reference.tempo)
    expect(bars).toHaveLength(36)
    for (const [index, bar] of bars.entries()) {
      expect(events(bar), `written bar ${index + 1}`).toEqual(expectedBars[index]!.events)
      expect(bar.events.reduce((sum, event) => sum + event.beats, 0)).toBe(index === 0 ? 1 : index === bars.length - 1 ? 3 : 4)
    }
  })

  it('aligns the first syllable 写 with 1 and 信 with 2 after the pickup rest', () => {
    const { lyricsByEvent } = deriveScoreInteraction(document)
    const pickup = bars[0]!.events
    expect(events(bars[0]!)).toEqual([['0', .5, false], ['1', .25, false], ['2', .25, false]])
    expect(pickup.map(event => (lyricsByEvent.get(event) ?? [])
      .filter(lyric => lyric.kind === 'text').map(lyric => lyric.text).join(''))).toEqual(['', '写', '信'])
    const firstNote = compileScorePerformance(document).notes[0]!
    expect(firstNote.start).toBe(.5)
    expect(firstNote.end).toBe(.75)
    expect(firstNote.pitch).toBe(71) // B4, scale degree 1 in B.
  })

  it('matches all lyric placements, including triplets, tied continuations and repeat pickups', () => {
    const { lyricsByEvent } = deriveScoreInteraction(document)
    for (const [index, bar] of bars.entries()) {
      expect(bar.events.map(event => (lyricsByEvent.get(event) ?? [])
        .filter(lyric => lyric.kind === 'text').map(lyric => lyric.text).join('')),
      `lyrics in written bar ${index + 1}`).toEqual(expectedBars[index]!.lyrics)
    }
  })

  it('starts with the vocal pickup and plays the indicated verse and chorus twice with their respective endings', () => {
    expect(document.order).toBeUndefined()
    expect(bars.flatMap((bar, index) => bar.left === 'rptstart' ? [index + 1] : [])).toEqual([reference.repeatStart - 7])
    expect(bars.flatMap((bar, index) => bar.right === 'rptend' ? [index + 1] : [])).toEqual([34])
    expect(bars.flatMap((bar, index) => bar.ending === '1' ? [index + 1] : [])).toEqual(reference.firstEnding.map(bar => bar - 7))
    expect(bars.flatMap((bar, index) => bar.ending === '2' ? [index + 1] : [])).toEqual(reference.secondEnding.map(bar => bar - 7))
    const played = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
    const expected = [
      ...expectedBars.slice(0, 34),
      ...reference.bars.slice(16, 39),
      ...expectedBars.slice(34, 36),
    ]
    expect(played.map(events)).toEqual(expected.map(bar => bar.events))
    expect(played).toHaveLength(59)
    expect(compileScorePerformance(document).beats).toBe(232)
  })
})
