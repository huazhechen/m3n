import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { compileScorePerformance, deriveScoreInteraction, formatM3N, parseM3NDocument, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import source from '../scores/ren_shi_jian_01.m3n?raw'

const document = parseM3NDocument(source)
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

it('returns through a full first ending and finishes through the second ending', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
  const beats = (bar: typeof bars[number]) => bar.events.reduce((sum, event) => sum + event.beats, 0)
  expect(beats(bars[0]!)).toBe(1)
  expect(beats(bars.at(-1)!)).toBe(3)
  expect(bars.slice(1, -1).every(bar => beats(bar) === 4)).toBe(true)
  expect(beats(bars.find(bar => bar.left === 'rptstart')!)).toBe(4)
  const returnBar = bars.find(bar => bar.right === 'rptend')!
  expect(returnBar.ending).toBe('1')
  expect(returnBar.events.slice(-4).map(event => event.pitches)).toEqual([[], ['3'], ['3'], ['2']])
  expect(bars.slice(-2).map(bar => bar.ending)).toEqual(['2', '2'])
  expect(source).toContain('L: 值得 | 有多少')
  expect(source).toContain('L: 生长 |')
})

it('preserves every performed note, rhythm, tie and lyric timing', () => {
  const bars = unfoldScorePerformance(document).parts.get('score')!.melody
  const tokens = bars.flatMap(bar => bar.events.map(event => [event.pitches, event.beats, event.tie ?? false, event.postfixes]))
  expect(hash(tokens)).toBe('37c36c96c833b870600240b745f8110d9282bf33cbf2261d2b4c094f9f7136ac')
  const performance = compileScorePerformance(document)
  expect(performance.beats).toBe(200)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const lyrics = performance.elements.filter(event => event.voice === 'score:melody')
    .flatMap(event => (byId.get(event.xmlId) ?? []).filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(event.rendition)))
      .map(lyric => [event.start, event.end, lyric.text]))
  expect(hash(lyrics)).toBe('637fb2f96c3bb5a365fa0c5c6174e860fb94f89917fb5a421e48a182bb577f67')
})
