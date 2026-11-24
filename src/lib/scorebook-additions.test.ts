import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import conan from '../scores/ru_guo_you_ni_zai_01.m3n?raw'
import stars from '../scores/xing_xing_dian_deng_01.m3n?raw'
import dream from '../scores/zhui_meng_ren_01.m3n?raw'
import references from './fixtures/kuaiyuepu-additions.json'
import dreamReference from './fixtures/zhui-meng-ren-baidu.json'
import starsReference from './fixtures/xing-xing-dian-deng-jitapuji.json'

const sources: Record<string, string> = { zhui_meng_ren: dream, xing_xing_dian_deng: stars, ru_guo_you_ni_zai: conan }
function events(source: string, expand = true) {
  const parsed = parseM3NDocument(source)
  const document = expand ? unfoldScorePerformance(parsed) : parsed
  const bars = document.parts.get('score')!.melody
  const pitches = resolveScorePitches(bars)
  return bars.flatMap(bar => bar.events.map(event => {
    const pitch = pitches.get(event)?.[0]
    const [name, octave, accidental] = pitch?.split(':') ?? []
    const degrees: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
    const alterations: Record<string, number> = { s: 1, f: -1, ss: 2, ff: -2 }
    return {
      pitch: pitch ? 12 * (Number(octave) + 1) + degrees[name]! + (alterations[accidental!] ?? 0) : null,
      beats: event.beats, tie: event.tie ?? false,
      instrumental: document.intervals.some(interval => interval.kind === 'inst' && interval.start !== undefined && interval.end !== undefined && interval.start <= event.sourceStart && event.sourceEnd <= interval.end),
    }
  }))
}

// Check lyrics at their performed note times, independent of source phrase boundaries.
function performedLyrics(source: string) {
  const document = parseM3NDocument(source)
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  return compileScorePerformance(document).elements
    .filter(element => element.voice === 'score:melody')
    .flatMap(element => (byId.get(element.xmlId) ?? [])
      .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
      .map(lyric => [element.start, element.end, lyric.text] as const))
}

function expectReferenceLyrics(source: string, reference: { lyricRows: string[]; playbackLyricRowIndexes: number[]; performedLyricsSha256: string }) {
  const lyrics = performedLyrics(source)
  const expectedText = reference.playbackLyricRowIndexes.map(index => reference.lyricRows[index]).join('')
  expect(lyrics.map(([, , text]) => text).join('')).toBe(expectedText)
  expect(createHash('sha256').update(JSON.stringify(lyrics)).digest('hex')).toBe(reference.performedLyricsSha256)
}

describe('new reference scores', () => {
  it('detects a shifted lyric even when the complete lyric text is unchanged', () => {
    const shifted = dream.replace('花%朵', '%花朵')
    expect(shifted).not.toBe(dream)
    expect(validateM3NDiagnostics(shifted)).toEqual([])
    const originalLyrics = performedLyrics(dream)
    const shiftedLyrics = performedLyrics(shifted)
    expect(shiftedLyrics.map(([, , text]) => text).join(''))
      .toBe(originalLyrics.map(([, , text]) => text).join(''))
    expect(shiftedLyrics).not.toEqual(originalLyrics)
  })

  it('reserves named musical sections for scores that actually jump between them', () => {
    const scores = import.meta.glob<string>('../scores/*.m3n', { eager: true, query: '?raw', import: 'default' })
    for (const [path, source] of Object.entries(scores)) {
      // Training category headings describe exercises rather than a performance route.
      if (path.endsWith('/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n')) continue
      const names = [...source.matchAll(/^===([^\n]+)/gm)].map(match => match[1]!.replace(/\{br\}/g, '').trim()).filter(Boolean)
      if (!names.length) continue
      const order = /\{order=([^}]+)\}/.exec(source)?.[1]?.split(',').map(name => name.trim())
      expect(order, path).toBeDefined()
      const visits = order ?? []
      expect(visits.filter((name, index) => index === 0 || name !== visits[index - 1]), path).not.toEqual(names)
    }
  })

  it.each(references)('validates $id and keeps a melody-only score', reference => {
    const source = sources[reference.id]!
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(parseM3NDocument(source).parts.get('score')!.bass.flatMap(bar => bar.events)).toEqual([])
  })

  it('uses the C-major 2/4 Dream Chaser reference without instrumental passages or navigation', () => {
    const document = parseM3NDocument(dream)
    expect(document).toMatchObject({ key: dreamReference.key, meterCount: 2, meterUnit: 4, tempo: 60 })
    const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(bars).toHaveLength(48)
    expect(bars.map(bar => bar.events.map(event => `${event.pitches[0] ?? '0'}:${event.beats}`)))
      .toEqual(dreamReference.writtenBars.map(row => row.split(' ').map(token => token.replace(/:\./, ':0.'))))
    expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0)))
      .toEqual(Array(48).fill(2))
    expect(bars.flatMap(bar => bar.events).some(event => event.sectionLabel)).toBe(false)
    expect(document.order).toBeUndefined()
    expect(bars.filter(bar => bar.ending).map(bar => bar.ending)).toEqual(['1', '2'])
    expect(document.intervals.some(interval => interval.kind === 'inst')).toBe(false)
    expect(bars.flatMap(bar => bar.events).some(event => event.navigation.length)).toBe(false)
    expect(dream).not.toMatch(/前奏|间奏/)
    expectReferenceLyrics(dream, dreamReference)
    expect(events(dream).reduce((sum, event) => sum + event.beats, 0)).toBe(dreamReference.performedBeats)
  })

  it('keeps the requested sustained 7 after compacting the endings', () => {
    const document = parseM3NDocument(dream)
    const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(bars[24]!.events.map(event => event.tie ?? false)).toEqual([false, false, false, false, false, false])
    expect(bars[25]!.events.map(event => event.tie ?? false)).toEqual([true, false, false])
    const { lyricsByEvent } = deriveScoreInteraction(document)
    expect(bars[25]!.events.map(event => (lyricsByEvent.get(event) ?? []).filter(lyric => lyric.kind === 'text').map(lyric => lyric.text).join('')))
      .toEqual(['人', '', '让'])
    const start = bars[24]!.events[3]!, end = bars[24]!.events[5]!
    expect(document.intervals.some(interval => interval.kind === 'lg' && interval.start === start.sourceStart && interval.endStart === end.sourceStart)).toBe(true)
  })

  it('checks every Dream Chaser tie and slur against the full original image audit', () => {
    const document = parseM3NDocument(dream)
    const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
    const positions = new Map(bars.flatMap((bar, index) => bar.events.map((event, offset) =>
      [event.sourceStart, [index + 1, offset + 1]] as const)))
    expect(bars.flatMap((bar, index) => bar.events.flatMap((event, offset) => event.tie ? [{ bar: index + 1, event: offset + 1 }] : [])))
      .toEqual(dreamReference.ties)
    expect(document.intervals.filter(interval => interval.kind === 'lg').map(interval => ({ start: positions.get(interval.start!), end: positions.get(interval.endStart!) })))
      .toEqual(dreamReference.slurs)
  })

  it('matches all Star Lighting melody events and ties from the five-page audit, without grace notes', () => {
    const document = parseM3NDocument(stars)
    const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(bars).toHaveLength(59)
    const tokens = (bar: typeof bars[number]) => bar.events.map(event => `${event.pitches[0] ?? '0'}:${event.beats}${event.tie ? '~' : ''}`)
    const introduction = parseM3NDocument(starsReference.userIntroduction).parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(bars.slice(0, 12).map(tokens)).toEqual(introduction.map(tokens))
    const reference = starsReference.writtenBarsAfterIntroduction
    const expected = [...reference.slice(0, 8), reference[6]!, starsReference.secondPassBar8, ...reference.slice(8)]
    expect(bars.slice(12).map(tokens)).toEqual(expected.map(row => row.split(' ').map(token => token.replace(/:\./, ':0.'))))
    expect(bars.every(bar => bar.events.reduce((sum, event) => sum + event.beats, 0) === 4)).toBe(true)
    expect(stars).not.toMatch(/\{a[cp]\(/)
    expect(bars.flatMap(bar => bar.events).every(event => event.postfixes.every(mark => !/^(ac|ap)\(/.test(mark)))).toBe(true)
    expectReferenceLyrics(stars, starsReference)
    expect(events(stars).reduce((sum, event) => sum + event.beats, 0)).toBe(380)
  })

  it('places Star Lighting lyrics on their original notes, including bars 20 and 31', () => {
    const document = parseM3NDocument(stars)
    const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
    const { lyricsByEvent } = deriveScoreInteraction(document)
    const words = (number: number) => bars[number - 1]!.events.map(event => (lyricsByEvent.get(event) ?? [])
      .filter(lyric => lyric.kind === 'text').map(lyric => lyric.text).join('/'))
    expect(words(20)).toEqual(['海', '角', '', '天', '', '边'])
    for (const number of [31, 35, 52, 56]) expect(words(number)).toEqual(['星', '星', '点', '灯', '', '照', '亮'])
    for (const number of [32, 53]) expect(words(number)).toEqual(['我', '的', '家', '门', '', '让'])
    for (const number of [34, 55]) expect(words(number)).toEqual(['来', '时', '的', '路', ''])
    expect(words(49)).toEqual(['偷', '偷', '探', '出', '了', '头', '', '是'])
    const positions = new Map(bars.flatMap((bar, index) => bar.events.map((event, offset) => [event.sourceStart, [index + 1, offset + 1]] as const)))
    expect(document.intervals.filter(interval => interval.kind === 'lg').map(interval => [positions.get(interval.start!), positions.get(interval.endStart!)]))
      .toEqual([[[17, 5], [17, 6]], [[20, 4], [20, 5]], [[37, 9], [37, 10]], [[58, 9], [59, 1]]])
  })

  it('writes Conan as forty full 4/4 measures and rejects either redundant barline', () => {
    const bars = parseM3NDocument(conan).parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(bars).toHaveLength(40)
    expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0)))
      .toEqual(Array(40).fill(4))
    for (const fragment of ['3~{/} 3', '7~ 7']) {
      const invalid = conan.replace(`${fragment}\n---`, `${fragment} |\n---`)
      expect(invalid).not.toBe(conan)
      expect(validateM3NDiagnostics(invalid).filter(diagnostic => diagnostic.code === 'M3N_METER_INCOMPLETE_MIDDLE'))
        .toHaveLength(2)
    }
  })

  it('keeps all Conan pitches and ties with only the eight authorized half-beat corrections', () => {
    const reference = references[2]!
    const expected = reference.playbackEventIndexes.map(index => reference.events[index]!).filter(event => event.pitch !== null)
    const actual = events(conan)
    const pitched = actual.filter(event => event.pitch !== null)
    expect(pitched.map(({ pitch, tie }) => ({ pitch, tie }))).toEqual(expected.map(({ pitch, tie }) => ({ pitch, tie })))
    expect(pitched.flatMap((event, index) => event.beats !== expected[index]!.beats ? [[index, event.beats - expected[index]!.beats]] : [])).toEqual([163,165,169,171,175,182,190,191].map(index => [index, -.5]))
    expect(actual.reduce((sum, event) => sum + event.beats, 0)).toBe(160)
    expect(parseM3NDocument(conan).title).toBe('如果有你在')
  })
})
