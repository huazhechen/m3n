import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import source from '../scores/ting_hai_01.m3n?raw'
import reference from './fixtures/ting-hai-upload-reference.json'

const document = parseM3NDocument(source)
const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
const events = (bar: typeof bars[number]) => bar.events.map(event => [
  event.pitches.join(',') || '0', event.beats, event.tie ?? false,
])

describe('Ting Hai uploaded reference d72b', () => {
  it('matches every printed pitch, octave, duration, rest and tie, including the eight-bar introduction', () => {
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(document.key).toBe(reference.key)
    expect(document.tempo).toBe(reference.tempo)
    expect(bars).toHaveLength(43)
    for (const [index, bar] of bars.entries()) {
      expect(events(bar), `written bar ${index + 1}`).toEqual(reference.bars[index]!.events)
      expect(bar.events.reduce((sum, event) => sum + event.beats, 0)).toBe(4)
    }
  })

  it('matches all lyric placements, including triplets, tied continuations and repeat pickups', () => {
    const { lyricsByEvent } = deriveScoreInteraction(document)
    for (const [index, bar] of bars.entries()) {
      expect(bar.events.map(event => (lyricsByEvent.get(event) ?? [])
        .filter(lyric => lyric.kind === 'text').map(lyric => lyric.text).join('')),
      `lyrics in written bar ${index + 1}`).toEqual(reference.bars[index]!.lyrics)
    }
  })

  it('plays the introduction once and the indicated verse and chorus twice with their respective endings', () => {
    expect(document.order).toBeUndefined()
    expect(bars.flatMap((bar, index) => bar.left === 'rptstart' ? [index + 1] : [])).toEqual([reference.repeatStart])
    expect(bars.flatMap((bar, index) => bar.right === 'rptend' ? [index + 1] : [])).toEqual([41])
    expect(bars.flatMap((bar, index) => bar.ending === '1' ? [index + 1] : [])).toEqual(reference.firstEnding)
    expect(bars.flatMap((bar, index) => bar.ending === '2' ? [index + 1] : [])).toEqual(reference.secondEnding)
    const played = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
    const expected = [
      ...reference.bars.slice(0, 41),
      ...reference.bars.slice(16, 39),
      ...reference.bars.slice(41, 43),
    ]
    expect(played.map(events)).toEqual(expected.map(bar => bar.events))
    expect(played).toHaveLength(66)
    expect(compileScorePerformance(document).beats).toBe(264)
  })
})
