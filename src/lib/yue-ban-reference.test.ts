import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, playbackMeasureIndexes, resolveScorePitches, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import source from '../scores/yue_ban_xiao_ye_qu_01.m3n?raw'
import reference from './fixtures/yue-ban-upload-reference.json'

const document = parseM3NDocument(source)
const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
const range = (start: number, end: number) => Array.from({ length: end - start }, (_, index) => start + index)

it('matches the simplified main melody and ties on every pass', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(document).toMatchObject({ key: 'Bb', meterCount: 4, meterUnit: 4, tempo: 80 })
  expect(bars.map(bar => bar.events.map(event => `${event.pitches.join(',') || '0'}:${event.beats}${event.tie ? '~' : ''}`).join(' ')))
    .toEqual(reference.writtenBars)
  expect(bars.flatMap(bar => bar.events).flatMap(event => event.postfixes).some(mark => /^(ac|ap)\(/.test(mark))).toBe(false)
  const expanded = unfoldScorePerformance(document).parts.get('score')!.melody
  const pitches = resolveScorePitches(expanded)
  const events = expanded.flatMap(bar => bar.events.map(event => [pitches.get(event) ?? [], event.beats, event.tie ?? false, event.postfixes]))
  expect(events).toHaveLength(reference.performedEventCount)
  expect(createHash('sha256').update(JSON.stringify(events)).digest('hex')).toBe(reference.performedEventsSha256)
})

it('keeps the reference subdivisions and sustained notes from bar 26 onward', () => {
  const rhythm = (index: number) => bars[index]!.events.map(event => [event.pitches[0], event.beats, event.tie ?? false])
  // The second beam covers 6 and 5, not 7 and 6.
  expect(rhythm(25)).toEqual([
    ['1e', 2, false], ['2e', 1, false], ['7', .5, false], ['6', .25, false], ['5', .25, true],
  ])
  // The first 5 continues the previous bar for a full beat; 5 and 6 are sixteenths.
  expect(rhythm(26)).toEqual([
    ['5', 1, false], ['3', .5, false], ['5', .25, false], ['6', .25, true],
    ['6', 1, false], ['6', .5, false], ['7', .5, false],
  ])
  expect(rhythm(32)).toEqual([
    ['2e', .5, false], ['1e', .5, false], ['7', .5, false], ['6', .25, false], ['5', .25, true],
    ['5', .5, false], ['5', .5, false], ['6', .5, false], ['7', .5, false],
  ])
})

it('plays the introduction and all three vocal endings while skipping the interlude and coda', () => {
  expect(playbackMeasureIndexes(bars)).toEqual([
    ...range(0, 39), ...range(9, 36), 39, 40, ...range(25, 36), 41, 42,
  ])
  expect(compileScorePerformance(document).beats).toBe(322)
  expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0)))
    .toEqual([2, ...Array(42).fill(4)])
})

it('pads the return pickup with rests and preserves the vocal ending before stopping', () => {
  expect(bars[38]!.events.map(event => [event.pitches, event.beats])).toEqual([
    [[], 2], [[], .5], [['3'], .25], [['3'], .25], [['1e'], .5], [['7'], .5],
  ])
  expect(bars[42]!.events.map(event => [event.pitches, event.beats])).toEqual([
    [['7'], 1], [['6'], 3],
  ])
})

it('keeps the complete performed lyrics across all three choruses', () => {
  const verse = '仍然倚在失眠夜望天边星宿仍然听见小提琴如泣似诉再挑逗为何只剩一弯月留在我的天空这晚以后音讯隔绝人如天上的明月是不可拥有情如曲过只遗留无可挽救再分别为何只是失望填密我的空虚这晚夜没有吻别'
  const chorus = '仍在说永久想不到是借口从未意会要分手但我的心每分每刻仍然被她占有她似这月儿仍然是不开口提琴独奏独奏着明月半倚深秋我的牵挂我的渴望直至以后'
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const lyrics = compileScorePerformance(document).elements.filter(element => element.voice === 'score:melody')
    .flatMap(element => (byId.get(element.xmlId) ?? [])
      .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
      .map(lyric => lyric.text)).join('')
  expect(lyrics).toBe(verse + chorus + verse + chorus + chorus)
})
