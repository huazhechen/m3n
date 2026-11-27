import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/an_xiang_01.m3n?raw'

const document = parseM3NDocument(source)
const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
const events = (bar: typeof bars[number]) => bar.events.flatMap(event => event.kind === 'tuplet'
  ? event.pitches.map(pitch => [pitch, event.beats / event.pitches.length])
  : [[event.pitches[0] ?? '0', event.beats]])

it('keeps the vocal bars and replaces original bars 33–42 with one interlude', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect([document.key, document.meterCount, document.meterUnit, document.tempo]).toEqual(['C', 4, 4, 70])
  expect(bars).toHaveLength(37)
  expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0))).toEqual(Array(37).fill(4))
  const melody = document.parts.get('score')!.melody
  expect(melody.filter(bar => bar.interlude)).toHaveLength(1)
  expect(melody.filter(bar => bar.events.length || bar.interlude)[32]!.interlude).toBe(true)
  expect(source).not.toMatch(/\{(?:inst|8va|key=A)\}/)
})

it('skips the interlude and jumps to Coda on the second vocal pass', () => {
  const played = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
  const expected = [...bars.slice(0, 32), ...bars.slice(0, 28), ...bars.slice(32)]
  expect(played.map(events)).toEqual(expected.map(events))
  expect(played).toHaveLength(65)
  expect(compileScorePerformance(document).beats).toBe(260)
  expect(bars.flatMap((bar, index) => bar.left === 'rptstart' ? [index + 1] : [])).toEqual([])
  expect(document.parts.get('score')!.melody.filter(bar => bar.right === 'rptend')).toHaveLength(1)
  expect(bars.every(bar => !bar.ending)).toBe(true)
  expect(source.match(/\{tocoda\}/g)).toHaveLength(1)
  expect(source.match(/\{coda\}/g)).toHaveLength(1)
})

it('preserves the chorus melody, distinct lyrics and Coda ending', () => {
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const lyrics = (index: number) => bars[index]!.events.map(event => (lyricsByEvent.get(event) ?? [])
    .filter(lyric => lyric.kind === 'text').map(lyric => lyric.text).join('')).join('')
  expect([18, 19, 26, 27].map(index => events(bars[index]!))).toEqual([
    [['6', 2], ['6', .5], ['5e', .5], ['4e', .5], ['2e', .5]],
    [['2e', .5], ['3e', .5], ['3e', 3]],
    [['6', 2], ['6', .5], ['5e', .5], ['4e', .5], ['2e', .5]],
    [['2e', .5], ['3e', .5], ['3e', 3]],
  ])
  expect([24, 25, 26, 27].map(lyrics)).toEqual(['烈火烧过青草', '痕看看又', '是一年春', '风'])
  expect([34, 35, 36].map(lyrics)).toEqual(['', '残留', ''])
  expect(source).not.toMatch(/\{(?:ac|ap)\(/)
  expect(bars.flatMap(bar => bar.events.flatMap(event => event.postfixes))).toEqual([])
  expect(bars[33]!.events.at(-1)!.tie).toBe(true)
  expect(events(bars[35]!)).toEqual([['5', 2], ['6', 2]])
  expect(bars[35]!.events[1]!.tie).toBe(true)
  expect(events(bars[36]!)).toEqual([['6', 4]])
})

it('holds 留 for four beats and immediately resumes the vocals after the interlude', () => {
  expect(events(bars[31]!)).toEqual([['3', 4]])
  const { lyricsByEvent } = deriveScoreInteraction(document)
  expect((lyricsByEvent.get(bars[31]!.events[0]!) ?? [])
    .filter(lyric => lyric.kind === 'text').map(lyric => lyric.text)).toEqual(['留'])
  const transition = compileScorePerformance(document).notes.filter(note => note.start >= 124 && note.start < 130)
  expect(transition.map(note => [note.pitch, note.start, note.end])).toEqual([[64, 124, 128], [64, 129, 129.5], [65, 129.5, 129.75], [64, 129.75, 130.5]])
  expect(bars.every(bar => bar.events.every(event => event.key === 'C' && event.octaveShift === 0))).toBe(true)
})
