import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import source from '../scores/tong_hua_zhen_01.m3n?raw'
import imageMelody from './fixtures/tong-hua-zhen-c33d.m3n?raw'

const document = parseM3NDocument(source)
const written = document.parts.get('score')!.melody.filter(bar => bar.events.length)
const performed = unfoldScorePerformance(document).parts.get('score')!.melody
const tokens = (bars: typeof written) => bars.flatMap(bar => bar.events.map(event => [event.pitches, event.beats, event.tie ?? false, event.postfixes]))

it('matches the c33d transcription through 都走到 in the original first-pass arrangement', () => {
  expect(validateM3NDiagnostics(source)).toEqual([])
  expect(document).toMatchObject({ key: 'C', meterCount: 2, meterUnit: 4, tempo: 69 })
  // User-requested simplification: bar 17 adopts bar 15's even sixteenths.
  const simplified = imageMelody.replace('((2. (1) 2. (1)))', '((2 1 2 1))')
    .replace('(3 5 3 2)', '(3 5 3) {lg}((2 1)){/}')
    .replace('(1 1 1 6d)', '(1 1 2 6d)')
    .replace('((6 5 6 5)) (4 (6 5~)) | 5 (0 (3 3))', '((6 5 6 5)) (4 (6 5~)) | (5 3) (0 (3 3))')
  const reference = tokens(parseM3NDocument(simplified).parts.get('score')!.melody)
  expect(tokens(performed).slice(0, reference.length)).toEqual(reference)
})

it('adds full-bar return houses while retaining the existing local houses', () => {
  expect(source.match(/^---V[12]$/gm)).toEqual(['---V1', '---V2', '---V1', '---V2', '---V1', '---V2'])
  const houses = source.split(/^---V[12]\n/gm).slice(1).map(part => part.split(/^---/m)[0]!)
  expect(houses.map(house => house.match(/^L: (.*)$/m)?.[1])).toEqual([
    '在爱里曲', '前方的山口汇',
    '刻听说', '刻又陌',
    '% | 呜{%2} | {%2}', '%',
  ])
  expect(source.match(/\|\|:/g)).toHaveLength(2)
  expect(source.match(/:\|\|/g)).toHaveLength(2)
  expect(source).not.toMatch(/===|\{order=|\{D\.S\./)
})

it('plays the introduction repeated 6s as sustains, with the extra opening rest from c33d', () => {
  expect(written[0]!.events.map(event => [event.pitches, event.beats])).toEqual([
    [[], 1], [[], .5], [['7'], .25], [['1e'], .25],
  ])
  expect(written.slice(0, 9).map(bar => bar.events.map(event => event.tie ?? false))).toEqual([
    [false, false, false, false], [false, true, true], [false, false, false, false],
    [false, true, false, false], [false, false, false, false], [false, true, true],
    [false, false, false, false], [false, false], [false, false, false, false],
  ])
  const notes = compileScorePerformance(document).notes.filter(note => note.start >= 6 && note.start < 8)
  expect(notes.map(note => [note.start, note.end, note.pitch])).toEqual([
    [6, 6.75, 71], [6.75, 7.5, 69], [7.5, 8, 67],
  ])
  expect(document.intervals.filter(interval => interval.kind === 'lg' && interval.start !== undefined && interval.start < written[8]!.events[0]!.sourceStart)).toEqual([])
})

it('checks the new dotted and syncopated rhythms and removes old-image ornaments', () => {
  const patterns = [
    ['3 (0 (3 5))', [1, .5, .25, .25]],
    ['(5 3) (0 (3 3))', [.5, .5, .5, .25, .25]],
    ['(3 5 3) {lg}((2 1)){/}', [.5, .5, .5, .25, .25]],
    ['(6 5) ((5) 5 (3))', [.5, .5, .25, .5, .25]],
    ['((6) 5 (4)) (5 4)', [.25, .5, .25, .5, .5]],
    ['((7d) 7d (7d) (7d) 1 (6d))', [.25, .5, .25, .25, .5, .25]],
  ] as const
  for (const [phrase, beats] of patterns) {
    const reference = parseM3NDocument(`{2/4}\nN: ${phrase}`).parts.get('score')!.melody
    expect(reference.flatMap(bar => bar.events.map(event => event.beats)), phrase).toEqual(beats)
    // Equivalent bracket grouping after formatting retains the complete bar.
    expect(written.map(bar => tokens([bar])), phrase).toContainEqual(tokens(reference))
  }
  expect(written.flatMap(bar => bar.events.flatMap(event => event.postfixes))).not.toContain('prall')
})

it('simplifies bar 17 to bar 15 rhythm while keeping its pitches and outgoing tie', () => {
  expect(written[15]!.events.map(event => event.beats)).toEqual(written[13]!.events.map(event => event.beats))
  expect(written[15]!.events.map(event => event.pitches)).toEqual([['2'], ['1'], ['2'], ['1'], ['2'], ['1'], ['7d']])
  expect(written[15]!.events.at(-1)!.tie).toBe(true)
})

it('shares the former second-house melody and leaves its extra 3 without first-pass lyrics', () => {
  const bar = written[30]!
  expect(bar.events.map(event => [event.pitches, event.beats])).toEqual([
    [['5'], .5], [['3'], .5], [[], .5], [['3'], .25], [['3'], .25],
  ])
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const verse = (pass: number) => bar.events.map(event => (lyricsByEvent.get(event) ?? [])
    .filter(lyric => lyric.kind === 'text' && lyric.passes?.has(pass)).map(lyric => lyric.text))
  expect(verse(1)).toEqual([[], [], [], ['变'], ['成']])
  expect(verse(2)).toEqual([[], ['影'], [], ['投'], ['进']])
})

it('sets 镇 in bar 38 to two slurred sixteenths in both verses', () => {
  const bar = written[34]!
  expect(bar.events.map(event => [event.pitches, event.beats])).toEqual([
    [['3'], .5], [['5'], .5], [['3'], .5], [['2'], .25], [['1'], .25],
  ])
  const slur = document.intervals.find(interval => interval.kind === 'lg' && interval.start === bar.events[3]!.sourceStart)
  expect(slur?.endStart).toBe(bar.events[4]!.sourceStart)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  expect(lyricsByEvent.get(bar.events[3]!)?.filter(lyric => lyric.kind === 'text').map(lyric => lyric.text)).toEqual(['镇', '镇'])
  expect(lyricsByEvent.get(bar.events[4]!)?.filter(lyric => lyric.kind === 'text') ?? []).toEqual([])
})

it('uses 2 for the third eighth note in bar 43', () => {
  expect(written[39]!.events.map(event => [event.pitches, event.beats])).toEqual([
    [['1'], .5], [['1'], .5], [['2'], .5], [['6d'], .5],
  ])
})

it('places 睡美 on adjacent notes and extends 美 over the next note in bar 11', () => {
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const bar = written[9]!
  const secondVerse = bar.events.map(event => (lyricsByEvent.get(event) ?? [])
    .filter(lyric => lyric.kind === 'text' && lyric.passes?.has(2)).map(lyric => lyric.text))
  expect(secondVerse).toEqual([['睡'], ['美'], [], ['人'], ['被'], ['埋'], ['藏']])
  expect(bar.events.map(event => event.beats)).toEqual([.25, .25, .25, .25, .5, .25, .25])
})

it('keeps both lyric verses aligned, including the shared rhythms and corrected ending', () => {
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const lyrics = compileScorePerformance(document).elements.filter(event => event.voice === 'score:melody')
    .flatMap(event => (byId.get(event.xmlId) ?? []).filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(event.rendition)))
      .map(lyric => lyric.text))
  expect(lyrics).toHaveLength(365)
  expect(lyrics.join('')).toContain('听说睡美人被埋藏')
  expect(lyrics.join('')).toContain('睡美人逃避了生活的煎熬小人鱼把阳光抹成眼影投进泡沫的怀抱')
  expect(lyrics.join('').match(/幸福结局的时刻/g)).toHaveLength(2)
  const repeatStart = written.find(bar => bar.left === 'rptstart')!
  expect(written.indexOf(repeatStart)).toBe(9)
  expect(repeatStart.events.reduce((sum, event) => sum + event.beats, 0)).toBe(2)
  const returnHouse = written.find(bar => bar.right === 'rptend')!
  expect(returnHouse.ending).toBe('1')
  expect(returnHouse.events.reduce((sum, event) => sum + event.beats, 0)).toBe(2)
  expect(written.every(bar => bar.events.reduce((sum, event) => sum + event.beats, 0) === 2)).toBe(true)
  expect(tokens(performed)).toHaveLength(503)
  expect(performed.reduce((sum, bar) => sum + bar.events.reduce((sum, event) => sum + event.beats, 0), 0)).toBe(210)
})

it('uses the requested ending pitches and lyric alignment within the original short coda', () => {
  const ending = written.find(bar => bar.events.map(event => event.pitches.join()).join(' ') === '7d 7d 7d 7d 1 6d')
  expect(ending).toBeDefined()
  expect(ending!.events.map(event => event.tie ?? false)).toEqual([false, false, false, false, false, false])
  const { lyricsByEvent } = deriveScoreInteraction(document)
  expect(ending!.events.map(event => lyricsByEvent.get(event)?.find(lyric => lyric.kind === 'text')?.text)).toEqual(['幸', '福', '结', '局', '的', '时'])
  const next = written[written.indexOf(ending!) + 1]!
  expect(next.events.map(event => [event.pitches, event.beats])).toEqual([
    [['7d'], 1], [[], .5], [['6d'], .25], [['7d'], .25],
  ])
  expect(lyricsByEvent.get(next.events[0]!)?.find(lyric => lyric.kind === 'text')?.text).toBe('刻')
  const figures = performed.filter(bar => bar.events.map(event => event.pitches.join()).join(' ') === '6 5 3 5 5 3 2 5')
  expect(figures).toHaveLength(2)
  for (const bar of figures) expect(bar.events.map(event => event.beats)).toEqual(Array(8).fill(.25))
  const final = performed.flatMap(bar => bar.events).at(-1)!
  expect([final.pitches, final.beats]).toEqual([['3'], 2])
})

it('preserves the updated performed melody and every lyric timing', () => {
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  expect(hash(tokens(performed))).toBe('06deeb983f9f50cdbd8173114bae86130f60da7c854cf7d4ac378a3745a4bfc6')
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  const lyrics = compileScorePerformance(document).elements.filter(event => event.voice === 'score:melody')
    .flatMap(event => (byId.get(event.xmlId) ?? []).filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(event.rendition)))
      .map(lyric => [event.start, event.end, lyric.text]))
  expect(hash(lyrics)).toBe('49edd3d8f1223b1b4b00040018aaeebb9e980ccdc4aa90ee35e0d7fb8d4587bf')
})
