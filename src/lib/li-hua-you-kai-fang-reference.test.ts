import { readFileSync } from 'node:fs'
import { compileScorePerformance, deriveScoreInteraction, formatM3N, parseM3NDocument, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { expect, it } from 'vitest'

const source = readFileSync(new URL('../scores/li_hua_you_kai_fang_01.m3n', import.meta.url), 'utf8')
const document = parseM3NDocument(source)
// Independently transcribed from fixtures/li-hua-you-kai-fang-upload.jpg.
// Pitch/duration in quarter notes; ~ continues into the following note.
// The user removed the instrumental intro; retain the one-beat vocal pickup.
// The repeat begins at bar 2; its first ending includes the second verse pickup.
// The final tonic complements the opening pickup with three beats.
const bars = [
  '0/.5 5d/.25 5d/.25',
  '3/1.5 3/.25 2/.25 1/1.5 2/.25 3/.25',
  '2/.75 2/.25 6d/2 0/.5 5d/.25 5d/.25',
  '2/1.5 2/.25 1/.25 7d/1.5 1/.25 2/.25',
  '1/.5 5d/.5 5d/.5 6d/.5 5d/1.5 5d/.25 5d/.25',
  '3/.5 3/1 3/.25 2/.25 1/1 3/t 4/t 5/t',
  '6b/.5 5/.25 4/.25~ 4/2 0/.5 5d/.25 5d/.25',
  '3/1.5 3/.25 3/.25 2/1 7d/t 1/t 2/t',
  '2/.5 1/.5 1/2 3/t 4/t 5/t',
  '6/.5 6/.5 6/.5 4/.25 2/.25~ 2/1 4/.5 6/.5',
  '5/1 5/.5 3/.5 1/1.5 2/.25 3/.25',
  '4/.75 4/.25~ 4/.5 3/.5 2/.5 2/.25 2/.25 2/.5 6/.25 6/.25',
  '5/3 3/t 4/t 5/t',
  '6/.5 6/.5 6/.5 4/.25 2/.25~ 2/1 4/.25 6/.75',
  '5/1 0/.25 5/.5 3/.25 1/1.5 2/.25 3/.25',
  '4/.75 4/.25~ 4/.5 3/.5 2/.75 1/.25 7d/.25 1/.25 2/.5',
  '1/3 0/.5 5d/.25 5d/.25',
  '1/3 3/t 4/t 5/t',
  '1/3 0/.5 2/.25 3/.25',
  '4/.75 4/.25~ 4/.5 3/.5 2/.75 1/.25 7d/.25 1/.25 2/.5',
  '1/3',
].map(bar => bar.split(' ').map(token => {
  const [pitch, duration] = token.split('/')
  return { pitch, beats: duration === 't' ? 1 / 3 : Number(duration!.replace('~', '')), tie: duration!.endsWith('~') }
}))
const range = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, index) => first + index)
const route = [...range(1, 17), ...range(2, 16), 18, ...range(10, 16), 19, 20, 21]

it('recreates the G-major image pitches, rhythm and ties through both verses, D.S. and the final ending', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(formatM3N(source)).toBe(source)
  expect(source).not.toContain('{inst}')
  expect(compileScorePerformance(document).notes[0]).toMatchObject({ pitch: 62, start: 0.5, end: 0.75 })
  expect(document).toMatchObject({ title: '梨花又开放', key: 'G', meterCount: 4, meterUnit: 4, tempo: 72, composer: '因幡晃', lyricist: '丁小齐' })
  const unfolded = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
  expect(unfolded).toHaveLength(route.length)
  for (const [index, bar] of unfolded.entries()) {
    const actual = bar.events.flatMap(event => event.kind === 'tuplet'
      ? event.pitches.map((pitch, i) => ({ pitch, beats: event.beats / event.pitches.length, tie: event.tupletTies?.includes(i) ?? false }))
      : [{ pitch: event.pitches[0] ?? '0', beats: event.beats, tie: !!event.tie }])
    expect(actual, `visit ${index + 1}, printed bar ${route[index]}`).toEqual(bars[route[index]! - 1])
  }
  expect(compileScorePerformance(document).beats).toBe(168)
  expect(compileScorePerformance(document).notes.at(-1)).toMatchObject({ pitch: 67, start: 165, end: 168 })
})

it('sings both image verses, the returned chorus and the complete final word', () => {
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const lyricsById = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const actual = compileScorePerformance(document).elements.filter(element => element.voice === 'score:melody')
    .filter((element, index, elements) => index === 0 || element.xmlId !== elements[index - 1]!.xmlId || element.rendition !== elements[index - 1]!.rendition)
    .flatMap(element => (lyricsById.get(element.xmlId) ?? [])
      .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
      .map(lyric => lyric.text)).join('').replace(/[，。]/g, '')
  const chorus = '摇摇洁白的树枝花雨满天飞扬落在妈妈头上飘在纺车上给我幸福的故乡永生难忘哦永生永世我不能忘'
  expect(actual).toBe('忘不了故乡年年梨花放染白了山岗我的小村庄妈妈坐在梨树下纺车嗡嗡响我爬上梨树枝闻那梨花香' + chorus
    + '重返了故乡梨花又开放找到了我的梦我一腔衷肠小村一切都依然树下空荡荡开满梨花的树下纺车不再嗡'
    + '摇摇洁白的树枝花雨满天飞扬两行滚滚泪水流在树下给我血肉的故乡永生难忘哦永生永世我不能忘'
    + chorus + '哦永生永世我不能忘')
})
