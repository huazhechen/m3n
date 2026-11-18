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
  const reference = tokens(parseM3NDocument(simplified).parts.get('score')!.melody)
  expect(tokens(performed).slice(0, reference.length)).toEqual(reference)
})

it('retains only the three original pairs of houses and the original repeat structure', () => {
  expect(source.match(/^---V[12]$/gm)).toEqual(['---V1', '---V2', '---V1', '---V2', '---V1', '---V2'])
  const houses = source.split(/^---V[12]\n/gm).slice(1).map(part => part.split(/^---/m)[0]!)
  expect(houses.map(house => house.match(/^L: (.*)$/m)?.[1])).toEqual([
    '帽有件抑制自己 | 变成', '鱼把阳光抹成眼 | 影投进',
    '在爱里曲 | 折川流', '前方的山口汇 | 合川流',
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
    [false, false, false, false], [false, false], [false],
  ])
  const notes = compileScorePerformance(document).notes.filter(note => note.start >= 6 && note.start < 8)
  expect(notes.map(note => [note.start, note.end, note.pitch])).toEqual([
    [6, 6.75, 71], [6.75, 7.5, 69], [7.5, 8, 67],
  ])
  expect(document.intervals.filter(interval => interval.kind === 'lg' && interval.start < written[8]!.events[0]!.sourceStart)).toEqual([])
})

it('checks the new dotted and syncopated rhythms and removes old-image ornaments', () => {
  const patterns = [
    ['(5 3) (0 (3 3))', [.5, .5, .5, .25, .25]],
    ['(3 5 3) {lg}((2 1)){/}', [.5, .5, .5, .25, .25]],
    ['(6 5) ((5) 5 (3))', [.5, .5, .25, .5, .25]],
    ['((6) 5 (4)) (5 4)', [.25, .5, .25, .5, .5]],
    ['((7d) 7d (7d~)) ((7d) 7d (6d))', [.25, .5, .25, .25, .5, .25]],
  ] as const
  for (const [phrase, beats] of patterns) {
    const offset = source.indexOf(phrase)
    const events = written.flatMap(bar => bar.events).filter(event => event.sourceStart >= offset && event.sourceStart < offset + phrase.length)
    expect(offset, phrase).toBeGreaterThan(-1)
    expect(events.map(event => event.beats), phrase).toEqual(beats)
  }
  expect(written.flatMap(bar => bar.events.flatMap(event => event.postfixes))).not.toContain('prall')
})

it('simplifies bar 17 to bar 15 rhythm while keeping its pitches and outgoing tie', () => {
  expect(written[16]!.events.map(event => event.beats)).toEqual(written[14]!.events.map(event => event.beats))
  expect(written[16]!.events.map(event => event.pitches)).toEqual([['2'], ['1'], ['2'], ['1'], ['2'], ['1'], ['7d']])
  expect(written[16]!.events.at(-1)!.tie).toBe(true)
})

it('sets 镇 in bar 38 to two slurred sixteenths in both verses', () => {
  const bar = written[37]!
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
  expect(written[42]!.events.map(event => [event.pitches, event.beats])).toEqual([
    [['1'], .5], [['1'], .5], [['2'], .5], [['6d'], .5],
  ])
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
  // Preserve the original one-beat ending plus the next one-beat pickup.
  const ending = written.find(bar => bar.events.map(event => event.pitches.join()).join(' ') === '6d 7d' && bar.events.every(event => event.beats === .5))
  expect(ending).toBeDefined()
  expect(tokens(performed)).toHaveLength(504)
  expect(performed.reduce((sum, bar) => sum + bar.events.reduce((sum, event) => sum + event.beats, 0), 0)).toBe(210)
})

it('uses the image ending pitches and coda figure within the original short coda', () => {
  const ending = written.find(bar => bar.events.map(event => event.pitches.join()).join(' ') === '7d 7d 7d 7d 7d 6d')
  expect(ending).toBeDefined()
  expect(ending!.events.map(event => event.tie ?? false)).toEqual([false, false, true, false, false, false])
  const figures = performed.filter(bar => bar.events.map(event => event.pitches.join()).join(' ') === '6 5 3 5 3 2 3 5')
  expect(figures).toHaveLength(2)
  for (const bar of figures) expect(bar.events.map(event => event.beats)).toEqual(Array(8).fill(.25))
  const final = performed.flatMap(bar => bar.events).at(-1)!
  expect([final.pitches, final.beats]).toEqual([['3'], 2])
})
