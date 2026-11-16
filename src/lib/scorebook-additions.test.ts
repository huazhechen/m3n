import { describe, expect, it } from 'vitest'
import { alternativePerformance, parseM3NDocument, resolveScorePitches, validateM3NDiagnostics } from '@m3n/notation'
import dream from '../scores/zhui_meng_ren_01.m3n?raw'
import stars from '../scores/xing_xing_dian_deng_01.m3n?raw'
import conan from '../scores/ru_guo_you_ni_zai_01.m3n?raw'
import references from './fixtures/kuaiyuepu-additions.json'
import starsReference from './fixtures/xing-xing-dian-deng-jitapuji.json'
import dreamReference from './fixtures/zhui-meng-ren-baidu.json'

const sources: Record<string, string> = { zhui_meng_ren: dream, xing_xing_dian_deng: stars, ru_guo_you_ni_zai: conan }
function events(source: string, expand = true) {
  const parsed = parseM3NDocument(source)
  const document = expand ? alternativePerformance(parsed) : parsed
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

describe('new reference scores', () => {
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
    expect(bars).toHaveLength(50)
    expect(bars.map(bar => bar.events.map(event => `${event.pitches[0] ?? '0'}:${event.beats}`)))
      .toEqual(dreamReference.writtenBars.map(row => row.split(' ').map(token => token.replace(/:\./, ':0.'))))
    expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0)))
      .toEqual([.25, ...Array(48).fill(2), 1.75])
    expect(bars.flatMap(bar => bar.events).some(event => event.sectionLabel)).toBe(false)
    expect(document.order).toBeUndefined()
    expect(bars.filter(bar => bar.ending).map(bar => bar.ending)).toEqual(['1', '1', '2', '2'])
    expect(document.intervals.some(interval => interval.kind === 'inst')).toBe(false)
    expect(bars.flatMap(bar => bar.events).some(event => event.navigation.length)).toBe(false)
    expect(dream).not.toMatch(/前奏|间奏/)
    expect(document.lyrics.map(block => block.syllables.map(syllable => syllable.text).join('').replace(/[^\u3400-\u9fff]/g, '')).filter(Boolean)).toEqual(dreamReference.lyricRows)
    expect(events(dream).reduce((sum, event) => sum + event.beats, 0)).toBe(dreamReference.performedBeats)
  })

  it('uses the exact user introduction and the new five-page reference', () => {
    const introduction = stars.slice(stars.indexOf('N:')).split('\n---\n').slice(0, 2).join('\n---\n')
    const referenceIntroduction = starsReference.userIntroduction.replace('===前奏\n', '').replace(/ \|\|$/, ' |')
    // Equivalent parentheses may change; every note, duration, tie and mark must remain.
    expect(events('{key=E}\n' + introduction, false)).toEqual(events('{key=E}\n' + referenceIntroduction, false))
    const document = parseM3NDocument(stars)
    const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(bars).toHaveLength(57)
    expect(bars.map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0))).toEqual(Array(57).fill(4))
    const actual = bars.slice(12).map(bar => bar.events.map(event =>
      `${event.pitches[0]}:${event.beats}${event.tie ? '~' : ''}${event.postfixes.filter(mark => mark.startsWith('ac(')).map(mark => '/' + mark.slice(3, -1)).join('')}`,
    ))
    const expected = starsReference.writtenBarsAfterIntroduction.map(row => row.split(' ').map(token => token.replace(/:\./, ':0.')))
    expect(actual).toEqual(expected)
    expect(bars.slice(0, 49).flatMap(bar => bar.events).every(event => event.key === 'E')).toBe(true)
    expect(bars.slice(49).flatMap(bar => bar.events).every(event => event.key === 'F')).toBe(true)
    expect(document.alternatives).toHaveLength(1)
    expect(document.alternatives![0]!.passes).toEqual([2])
    expect(document.alternatives![0]!.measure.events.map(event => `${event.pitches[0]}:${event.beats}`).join(' ')).toBe(starsReference.secondPassBar8.replace(/:\./g, ':0.'))
    expect(document.lyrics.map(block => block.syllables.map(syllable => syllable.text).join('').replace(/[^\u3400-\u9fff]/g, '')).filter(Boolean)).toEqual(starsReference.lyricRows)
    // Five opening bars once, the 7-bar instrumental + 24-bar vocal repeat twice,
    // a 4-bar reprise + 8-bar third verse, and two complete 8-bar F choruses.
    expect(events(stars).reduce((sum, event) => sum + event.beats, 0)).toBe(380)
    expect(stars).toContain('重复多次，渐弱结束')
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
