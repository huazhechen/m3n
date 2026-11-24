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

  it('shares three Dream Chaser verses and returns from the chorus to bar 2', () => {
    const document = parseM3NDocument(dream)
    expect(document).toMatchObject({ key: dreamReference.key, meterCount: 2, meterUnit: 4, tempo: 60 })
    const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(bars).toHaveLength(33)
    expect(bars.map(bar => bar.events.map(event => `${event.pitches[0] ?? '0'}:${event.beats}`)))
      .toEqual(dreamReference.writtenBars.map(row => row.split(' ').map(token => token.replace(/:\./, ':0.'))))
    expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0)))
      .toEqual(Array(33).fill(2))
    expect(bars.flatMap(bar => bar.events).some(event => event.sectionLabel)).toBe(false)
    expect(document.order).toBeUndefined()
    expect(bars.filter(bar => bar.ending).map(bar => bar.ending)).toEqual(['1', ...Array(9).fill('2'), '3'])
    expect(document.intervals.some(interval => interval.kind === 'inst')).toBe(false)
    expect(bars[1]!.navigation).toContain('segno')
    expect(bars[25]!.navigation).toContain('ds')
    const { lyricsByEvent } = deriveScoreInteraction(document)
    const target = bars[1]!.events[2]!
    expect(lyricsByEvent.get(target)).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '的', forceTiedTarget: true }),
    ]))
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
    expect(bars).toHaveLength(58)
    const tokens = (bar: typeof bars[number]) => bar.events.map(event => `${event.pitches[0] ?? '0'}:${event.beats}${event.tie ? '~' : ''}`)
    const introduction = parseM3NDocument(starsReference.userIntroduction).parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(bars.slice(0, 12).map(tokens)).toEqual(introduction.map(tokens))
    const reference = starsReference.writtenBarsAfterIntroduction
    // User corrections use the original written bar numbers, before sharing bars 19/21.
    const corrected = [...reference]
    corrected[5] = '5:.5 5:.25 5:.25 5:.5 5:.25 6:.25 5:1.5 1:.5'
    corrected[6] = '2:.5 2:.25 2:.25 2:.5 2:.5 2:.5 2:.25 3:.25 2:.75 6d:.25'
    corrected[8] = '2:.5 2:.5 2:.5 2:.25 1:.25 2:.25 3:.25 2:.5~ 2:1'
    corrected[9] = '3:.5 2:.5 1:.25 2:.25 1:.25 7d:.25 6d:1.5 6d:.5'
    corrected[11] = '5:.5 4:.5 3:.5 2:.5 3:2'
    corrected[13] = '3:.5 2:.5 1:.5 7d:.25 1:.25 6d:2'
    // The repeat now starts at intro bar 5; each ending writes its final vocal bar.
    corrected[22] = '1e:.25 7:.25 1e:.5~ 1e:.5 1e:.25 2e:.25 7:.5 6:.5 5:.5 7:.5'
    corrected[23] = corrected[22]
    corrected[30] = '6:.5 6:.5 5:.25 6:.25 5:.25 4:.25 3:2'
    corrected[31] = '2:.75 2:.25 2:.5 2:.5 2:.5 2:.25 2:.25 2:.5 1:.25 2:.25'
    corrected[32] = '3:.5 3:.5 5:.25 3:.25 2:.5 3:2'
    corrected[34] = '6:.5 6:.5 5:.25 6:.25 5:.25 4:.25 3:1~ 3:.75 1:.25'
    corrected[36] = '6:.5 6:.5 7:.25 6:.25 5:.5 6:2'
    const expected = [...corrected.slice(0, 8), starsReference.secondPassBar8, ...corrected.slice(8)]
    expect(bars.slice(12).map(tokens)).toEqual(expected.map(row => row.split(' ').map(token => token.replace(/:\./, ':0.'))))
    expect(bars.every(bar => bar.events.reduce((sum, event) => sum + event.beats, 0) === 4)).toBe(true)
    expect(stars).not.toMatch(/\{a[cp]\(/)
    expect(bars.flatMap(bar => bar.events).every(event => event.postfixes.every(mark => !/^(ac|ap)\(/.test(mark)))).toBe(true)
    expectReferenceLyrics(stars, starsReference)
    expect(events(stars).reduce((sum, event) => sum + event.beats, 0)).toBe(380)
  })

  it('starts the first repeat a bar earlier and gives each ending its corrected vocal cadence', () => {
    const document = parseM3NDocument(stars)
    const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(bars.flatMap((bar, index) => bar.left === 'rptstart' ? [index + 1] : [])).toEqual([5, 51])
    expect(bars[35]!.ending).toBe('1')
    expect(bars[35]!.right).toBe('rptend')
    expect(bars[36]!.ending).toBe('2')
    const cadence = (index: number) => bars[index]!.events.slice(-2).map(event => [event.pitches, event.beats, event.tie ?? false])
    expect(cadence(35)).toEqual([[['5'], .5, false], [['7'], .5, false]])
    expect(cadence(36)).toEqual([[['5'], .5, false], [['7'], .5, false]])
    expect(bars[37]!.events.map(event => [event.pitches, event.beats])).toEqual([[['6'], 4]])
    const { lyricsByEvent } = deriveScoreInteraction(document)
    for (const index of [35, 36]) {
      expect(bars[index]!.events.flatMap(event => (lyricsByEvent.get(event) ?? [])
        .filter(lyric => lyric.kind === 'text').map(lyric => lyric.text)).join('')).toBe('一点光温暖孩子的心')
    }
  })

  it('matches the final chorus to the earlier second-pass chorus, including every tie and slur', () => {
    const document = parseM3NDocument(stars)
    const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
    const earlier = [29, 30, 31, 32, 33, 34, 36, 37].map(index => bars[index]!)
    const final = bars.slice(50)
    const notes = (section: typeof bars) => section.map(bar => bar.events.map(event =>
      [event.pitches, event.beats, event.tie ?? false, event.postfixes]))
    expect(notes(final)).toEqual(notes(earlier))
    const slurs = (section: typeof bars) => {
      const positions = new Map(section.flatMap((bar, index) => bar.events.map((event, offset) =>
        [event.sourceStart, [index, offset]] as const)))
      return document.intervals.filter(interval => interval.kind === 'lg' && positions.has(interval.start!))
        .map(interval => [positions.get(interval.start!), positions.get(interval.endStart!)])
    }
    expect(slurs(final)).toEqual(slurs(earlier))
  })

  it('places Star Lighting lyrics on their original notes, including the shared ending entry and corrected verse', () => {
    const document = parseM3NDocument(stars)
    const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
    const { lyricsByEvent } = deriveScoreInteraction(document)
    const words = (number: number) => bars[number - 1]!.events.map(event => (lyricsByEvent.get(event) ?? [])
      .filter(lyric => lyric.kind === 'text').map(lyric => lyric.text).join('/'))
    expect(words(20)).toEqual(['海', '角', '', '天', '', '边'])
    for (const number of [30, 34, 51, 55]) expect(words(number)).toEqual(['星', '星', '点', '灯', '', '照', '亮'])
    for (const number of [31, 52]) expect(words(number)).toEqual(['我', '的', '家', '门', '', '让'])
    for (const number of [33, 54]) expect(words(number)).toEqual(['来', '时', '的', '路', ''])
    expect(words(48)).toEqual(['偷', '偷', '探', '', '出', '了', '头', '', '是'])
    const positions = new Map(bars.flatMap((bar, index) => bar.events.map((event, offset) => [event.sourceStart, [index + 1, offset + 1]] as const)))
    expect(document.intervals.filter(interval => interval.kind === 'lg').map(interval => [positions.get(interval.start!), positions.get(interval.endStart!)]))
      .toEqual([[[17, 5], [17, 6]], [[18, 5], [18, 6]], [[19, 7], [19, 8]], [[20, 4], [20, 5]], [[22, 6], [22, 7]], [[23, 3], [23, 4]], [[27, 4], [27, 5]], [[37, 10], [38, 1]], [[44, 3], [44, 4]], [[45, 9], [45, 10]], [[46, 3], [46, 4]], [[48, 3], [48, 4]], [[50, 3], [50, 4]], [[57, 10], [58, 1]]])
  })

  it('writes Conan as forty full 4/4 measures and rejects either redundant barline', () => {
    const bars = parseM3NDocument(conan).parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(bars).toHaveLength(40)
    expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0)))
      .toEqual(Array(40).fill(4))
    for (const fragment of ['3~{/} 3', '7~ 7^']) {
      const invalid = conan.replace(`${fragment}\n---`, `${fragment} |\n---`)
      expect(invalid).not.toBe(conan)
      expect(validateM3NDiagnostics(invalid).filter(diagnostic => diagnostic.code === 'M3N_METER_INCOMPLETE_MIDDLE'))
        .toHaveLength(2)
    }
  })

  it('holds the 7 for three beats in Conan bar 25 and matches the opening eighth-note pickup', () => {
    const bars = parseM3NDocument(conan).parts.get('score')!.melody
    const signature = (event: typeof bars[number]['events'][number]) =>
      [event.pitches, event.beats, event.tie, event.postfixes]
    expect(bars[24]!.events.slice(0, 2).map(signature))
      .toEqual([[['7'], 1, true, []], [['7'], 2, false, []]])
    expect(bars[24]!.events.slice(2).map(signature))
      .toEqual(bars[0]!.events.slice(3).map(signature))
  })

  it('keeps all Conan pitches and ties with the authorized rhythm corrections', () => {
    const reference = references[2]!
    const expected = reference.playbackEventIndexes.map(index => reference.events[index]!).filter(event => event.pitch !== null)
    const actual = events(conan)
    const pitched = actual.filter(event => event.pitch !== null)
    expect(pitched.map(({ pitch, tie }) => ({ pitch, tie }))).toEqual(expected.map(({ pitch, tie }) => ({ pitch, tie })))
    expect(pitched.flatMap((event, index) => event.beats !== expected[index]!.beats ? [[index, event.beats - expected[index]!.beats]] : [])).toEqual([[120, 1], [121, -.5], [122, -.5], ...[163,165,169,171,175,182,190,191].map(index => [index, -.5])])
    expect(actual.reduce((sum, event) => sum + event.beats, 0)).toBe(160)
    expect(parseM3NDocument(conan).title).toBe('如果有你在')
  })
})
