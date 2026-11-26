import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'
import source from '../scores/an_xiang_01.m3n?raw'

// Read independently from upload 86d558fc3784adf2c1c548557d020a5e.jpeg.
// Degree/duration, in quarter-note beats. Tuplets are expanded below.
const instrumental = [
  '6d/.5 3d/.5 7/.5 1/.5 2/.5 7d/.5 1/.5 3/.5',
  '6 7/.5 1e/.5 2e/.5 7/.5 1e/.5 3e/.5',
  '6e/2 5#e/2', '5#e/4',
  '3d/.25 7d/.25 1d/.25 2d/.25 1d/.25 7d/.25 1d/.25 2d/.25 3d/.25 7d/.25 1d/.25 2d/.25 1d/.25 7d/.25 1d/.25 2d/.25',
  '6d/.25 7d/.25 1/.25 2/.25 3/.25 7d/.25 1/.25 2/.25 6/.25 7/.25 1e/.25 2e/.25 3e/.125 6/.125 7e/.125 1e/.125 2e/.125 3e/.125 4e/.125 5e/.125',
  '1e/2 1e/.5 7/.5 1e/.5 3e/.5',
  '6/3 1ee', '7e/2 6e 5e/.5 4e/.5', '3e/3 0',
  '6/t 3/t 3/t 5/t 3/t 3/t 6/t 3/t 3/t 1e/t 3/t 3/t',
  '2ee 7e/.25 6e/.25 4e/.25 2e/.25 7/.25 6/.25 4/.25 2/.25 7d/.25 6d/.25 4d/.25 2d/.25',
  '2d/t 3d/t 4d/t 5d/t 6d/t 7d/t 1 0', '2/4',
].map(row => row.split(' ').map(token => {
  const [pitch, beats] = token.split('/')
  return [pitch, beats === 't' ? 1 / 3 : Number(beats ?? 1)]
}))
const document = parseM3NDocument(source)
const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
const events = (bar: typeof bars[number]) => bar.events.flatMap(event => event.kind === 'tuplet'
  ? event.pitches.map(pitch => [pitch, event.beats / event.pitches.length])
  : [[event.pitches[0] ?? '0', event.beats]])

it('matches every instrumental pitch, octave and duration, including the fast runs and triplets', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect([document.key, document.meterCount, document.meterUnit, document.tempo]).toEqual(['C', 4, 4, 70])
  expect(bars).toHaveLength(51)
  expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0))).toEqual(Array(51).fill(4))
  const actual = [...bars.slice(0, 4), ...bars.slice(36, 46)].map(events)
  expect(actual).toEqual(instrumental)
  expect(bars[2]!.events[1]!.tie).toBe(true)
  expect(bars[38]!.events[0]!.tie).toBe(true)
})

it('plays the introduction once and the vocal section twice, with the interlude only in the first ending', () => {
  const played = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
  const expected = [...bars.slice(0, 46), ...bars.slice(4, 32), ...bars.slice(46)]
  expect(played.map(events)).toEqual(expected.map(events))
  expect(played).toHaveLength(79)
  expect(compileScorePerformance(document).beats).toBe(316)
  expect(bars.flatMap((bar, index) => bar.left === 'rptstart' ? [index + 1] : [])).toEqual([5])
  expect(bars.flatMap((bar, index) => bar.right === 'rptend' ? [index + 1] : [])).toEqual([46])
})

it('corrects the chorus melody, restores the distinct lyrics and places every syllable outside the instruments', () => {
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const lyrics = (index: number) => bars[index]!.events.map(event => (lyricsByEvent.get(event) ?? [])
    .filter(lyric => lyric.kind === 'text').map(lyric => lyric.text).join('')).join('')
  expect([22, 23, 30, 31].map(index => events(bars[index]!))).toEqual([
    [['6', 2], ['6', .5], ['5e', .5], ['4e', .5], ['2e', .5]],
    [['2e', .5], ['3e', .5], ['3e', 3]],
    [['6', 2], ['6', .5], ['5e', .5], ['4e', .5], ['2e', .5]],
    [['2e', .5], ['3e', .5], ['3e', 3]],
  ])
  expect([28, 29, 30, 31].map(lyrics)).toEqual(['烈火烧过青草', '痕看看又', '是一年春', '风'])
  expect([48, 49, 50].map(lyrics)).toEqual(['', '残留', ''])
  expect([...bars.slice(0, 4), ...bars.slice(36, 46)].flatMap(bar => bar.events)
    .flatMap(event => lyricsByEvent.get(event) ?? []).filter(lyric => lyric.kind === 'text')).toEqual([])
  expect([5, 9].map(index => bars[index]!.events[0]!.postfixes)).toEqual(Array(2).fill(['ac((5))']))
  expect(bars[49]!.events[1]!.postfixes).toEqual(['ac((5))'])
  expect(bars[47]!.events.at(-1)!.tie).toBe(true)
  expect(events(bars[49]!)).toEqual([['5', 2], ['6', 2]])
  expect(bars[49]!.events[1]!.tie).toBe(true)
  expect(events(bars[50]!)).toEqual([['6', 4]])
})
