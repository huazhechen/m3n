import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import source from '../scores/tong_hua_zhen_01.m3n?raw'
import reference from './fixtures/tong-hua-zhen-upload.json'

const document = parseM3NDocument(source)
const written = document.parts.get('score')!.melody.filter(bar => bar.events.length)
const performed = unfoldScorePerformance(document).parts.get('score')!.melody
const tokens = (bars: typeof written) => bars.map(bar => bar.events.map(event => [event.pitches, event.beats, event.tie ?? false, event.postfixes]))

it('reads every introduction duration directly from the image, including the pickup', () => {
  // Each entry is a written fragment; the first is the one-beat pickup.
  expect(written.slice(0, 9).map(bar => bar.events.map(event => event.beats))).toEqual([
    [.5, .25, .25],
    [.75, .25, 1],
    [1, .5, .25, .25],
    [.75, .25, .5, .5], // 7· 6 6 5
    [1, .5, .25, .25], // 3 0 7 1
    [.75, .25, 1],
    [1, .5, .25, .25],
    [1.5, .5],
    [1],
  ])
})

it('starts the phrase slur on 2 after the ornamented 3, as printed above 话镇', () => {
  const position = source.indexOf('{lg}(2 1)')
  const slur = document.intervals.find(interval => interval.kind === 'lg' && interval.start === position + 5)
  expect(slur).toBeDefined()
  const notes = written.flatMap(bar => bar.events)
  expect(notes.find(event => event.sourceStart === slur!.start)?.pitches).toEqual(['2'])
  expect(notes.find(event => event.sourceStart === slur!.endStart)?.pitches).toEqual(['1'])
})

it('matches the uploaded first page and converts the existing second page to 2/4', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(document).toMatchObject({ key: 'C', meterCount: 2, meterUnit: 4, tempo: 70 })
  const firstPage = reference.page1Bars.flat()
  expect(tokens(performed).flat().slice(0, firstPage.length)).toEqual(firstPage)
  expect(tokens(written.slice(-reference.page2Bars.length))).toEqual(reference.page2Bars)
  expect(source).not.toMatch(/===|\{order=/)
})

it('keeps the photo-specific second-pass rhythms in houses', () => {
  // 睡美人、逃避了、影投进、前方的山口汇: independent rhythms read from the image.
  const rhythms = [
    { phrase: '((1) 1 (7d))', beats: [.25, .5, .25] },
    { phrase: '((4#) 4 (3))', beats: [.25, .5, .25] },
    { phrase: '(5 3.) ((0 3 3))', beats: [.5, .75, .25, .25, .25] },
    { phrase: '((1) 2 (1)) ((2) 1 (6d))', beats: [.25, .5, .25, .25, .5, .25] },
  ]
  for (const { phrase, beats } of rhythms) {
    const bar = written.find(bar => bar.events[0]?.sourceStart === source.indexOf(phrase) + phrase.indexOf(phrase.includes('4#') ? '4#' : phrase.startsWith('(5') ? '5' : '1'))
    expect(bar, phrase).toBeDefined()
    expect(bar!.events.slice(0, beats.length).map(event => event.beats)).toEqual(beats)
  }
})

it('preserves the complete performed notes, lyrics and repeat order after calibration', () => {
  const pitches = resolveScorePitches(performed)
  const music = performed.flatMap(bar => bar.events.map(event => [pitches.get(event) ?? [], event.beats, event.tie, event.postfixes, event.dynamic ?? null, event.tempo]))
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const lyrics = compileScorePerformance(document).elements.filter(event => event.voice === 'score:melody')
    .flatMap(event => (byId.get(event.xmlId) ?? []).filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(event.rendition)))
      .map(lyric => [event.start, event.end, lyric.text]))
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  expect(music).toHaveLength(reference.events)
  expect(lyrics).toHaveLength(reference.syllables)
  expect(performed.reduce((sum, bar) => sum + bar.events.reduce((sum, event) => sum + event.beats, 0), 0)).toBe(reference.performedBeats)
  expect(hash(music)).toBe(reference.performedMusicSha256)
  expect(hash(lyrics)).toBe(reference.performedLyricsSha256)
})
