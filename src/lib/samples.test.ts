import { describe, expect, it } from 'vitest'
import { m3nToMei, parseM3NDocument, measurePlaybackPasses, validateM3NDiagnostics } from '@m3n/notation'
import besameMucho from '../scores/besame_mucho_01.m3n?raw'
import theSwan from '../scores/tian_e_01.m3n?raw'
import mozartK545 from '../scores/mozart_k545_01.m3n?raw'
import loveLikeTide from '../scores/ai_ru_chao_shui_01.m3n?raw'
import maple from '../scores/feng_01.m3n?raw'
import smoke from '../scores/yan_hua_yi_leng_01.m3n?raw'
import polka from '../scores/dan_huang_guan_bo_er_ka_01.m3n?raw'
import salut from '../scores/ai_de_li_zan_01.m3n?raw'
import elise from '../scores/zhi_ai_li_si_01.m3n?raw'
import { loadPresetScore, presetScores } from './samples'

describe('bundled score corpus', () => {
  it.each([
    ['feng', '枫', maple, 76, 4],
    ['yan_hua_yi_leng', '烟花易冷', smoke, 51, 4],
    ['dan_huang_guan_bo_er_ka', '单簧管波尔卡', polka, 78, 2],
    ['ai_de_li_zan', '爱的礼赞', salut, 100, 2],
    ['zhi_ai_li_si', '致爱丽丝', elise, 106, 1.5],
  ] as const)('loads the complete PDF melody %s with its original bar durations', async (id, title, source, count, beats) => {
    const entry = presetScores.find(score => score.sourcePath === `${id}_01.m3n`)
    expect(entry?.title).toBe(title)
    expect(await loadPresetScore(entry!.slug)).toBe(source)
    expect(validateM3NDiagnostics(source)).toEqual([])
    const part = parseM3NDocument(source).parts.get('score')!
    const measures = part.melody.filter(measure => measure.events.length)
    expect(measures).toHaveLength(count)
    const expected = Array<number>(count).fill(beats)
    if (id === 'feng') expected[4] = 2
    if (id === 'zhi_ai_li_si') {
      expected[0] = 0.5
      expected[8] = 1
      expected[105] = 1
    }
    expect(measures.map(measure => measure.events.reduce((sum, event) => sum + event.beats, 0)))
      .toEqual(expected)
    expect(part.bass.flatMap(measure => measure.events)).toEqual([])
    expect(measures.flatMap(measure => measure.events).every(event =>
      event.kind !== 'chord' && event.postfixes.every(mark => !/^f[1-5]$/.test(mark)),
    )).toBe(true)
  })

  it('retains the PDF repeat scopes, modulation, ornaments and fast subdivisions', () => {
    const bars = (source: string) => parseM3NDocument(source).parts.get('score')!.melody.filter(measure => measure.events.length)
    const smokeBars = bars(smoke)
    const passes = measurePlaybackPasses(smokeBars)
    expect(smokeBars.map(measure => [...passes.get(measure)!])).toEqual([
      ...Array.from({ length: 4 }, () => [1]),
      ...Array.from({ length: 31 }, () => [1, 2]),
      ...Array.from({ length: 2 }, () => [1]),
      ...Array.from({ length: 14 }, () => [2]),
    ])
    const polkaBars = bars(polka)
    expect(polkaBars.flatMap((measure, index) => measure.left === 'rptstart' ? [index + 1] : []))
      .toEqual([3, 20, 45, 62])
    expect(polkaBars.flatMap((measure, index) => measure.ending === '1' ? [index + 1] : []))
      .toEqual([18, 27, 60, 77])
    expect([19, 28, 44, 61].map(index => polkaBars[index]!.events[0]!.key)).toEqual(['G', 'C', 'F', 'C'])
    const mapleBars = bars(maple)
    expect(mapleBars[49]!.events[0]!.key).toBe('Db')
    expect(mapleBars[1]!.events[0]!.beats).toBe(0.0625)
    const salutBars = bars(salut)
    expect(salutBars[9]!.events[1]!.pitches).toEqual(['2#e'])
    expect(salutBars[32]!.events[0]!.tie).toBe(true)
    expect([34, 48].map(index => salutBars[index]!.events[0]!.key)).toEqual(['G', 'E'])
    const eliseBars = bars(elise)
    expect(eliseBars.flatMap((measure, index) => measure.right === 'rptend' ? [index + 1] : []))
      .toEqual([9, 24])
    expect(eliseBars[79]!.events.map(event => event.beats)).toEqual([0.5, 0.5, 0.5])
    expect(eliseBars[81]!.events[1]!.pitches).toEqual(['6ee', '1eee', '3eee'])
  })

  it('includes Love Like Tide with both houses, upper mordents and no D.C.', async () => {
    const entry = presetScores.find(score => score.sourcePath === 'ai_ru_chao_shui_01.m3n')
    expect(entry?.title).toBe('爱如潮水')
    expect(await loadPresetScore(entry!.slug)).toBe(loveLikeTide)
    expect(validateM3NDiagnostics(loveLikeTide)).toEqual([])
    const document = parseM3NDocument(loveLikeTide)
    expect(document).toMatchObject({ key: 'E', meterCount: 4, meterUnit: 4, tempo: 75 })
    const measures = document.parts.get('score')!.melody.filter(measure => measure.events.length)
    expect(measures).toHaveLength(28)
    expect(measures.map(measure => measure.events.reduce((sum, event) => sum + event.beats, 0)))
      .toEqual(Array(28).fill(4))
    expect(measures.flatMap((measure, index) => measure.ending === '1' ? [index + 1] : []))
      .toEqual([13, 14, 15, 16])
    expect(measures.flatMap((measure, index) => measure.ending === '2' ? [index + 1] : []))
      .toEqual(Array.from({ length: 12 }, (_, index) => index + 17))
    const passes = measurePlaybackPasses(measures)
    expect(measures.map(measure => [...passes.get(measure)!])).toEqual([
      ...Array.from({ length: 7 }, () => [1]),
      ...Array.from({ length: 5 }, () => [1, 2]),
      ...Array.from({ length: 4 }, () => [1]),
      ...Array.from({ length: 12 }, () => [2]),
    ])
    expect(measures[15]!.events.filter(event => event.postfixes.includes('prall'))).toHaveLength(2)
    expect(measures.flatMap(measure => measure.events).flatMap(event => event.navigation)).not.toContain('dc')
    expect(loveLikeTide).not.toMatch(/D\.C\.|\{dc\}/)
    expect(measures[0]!.events.filter(event => event.tie)).toHaveLength(2)
  })

  it('includes K.545 as a complete single melody with both original repeats', async () => {
    const entry = presetScores.find(score => score.sourcePath === 'mozart_k545_01.m3n')
    expect(entry?.title).toBe('C大调奏鸣曲 K.545 第一乐章')
    expect(await loadPresetScore(entry!.slug)).toBe(mozartK545)
    expect(validateM3NDiagnostics(mozartK545)).toEqual([])
    const document = parseM3NDocument(mozartK545)
    expect(document).toMatchObject({ key: 'C', meterCount: 4, meterUnit: 4, hasExplicitTempo: false })
    const part = document.parts.get('score')!
    const measures = part.melody.filter(measure => measure.events.length)
    expect(measures).toHaveLength(73)
    expect(measures.map(measure => measure.events.reduce((sum, event) => sum + event.beats, 0)))
      .toEqual(Array(73).fill(4))
    expect(part.bass.flatMap(measure => measure.events)).toEqual([])
    expect(measures.flatMap(measure => measure.events).every(event =>
      event.kind !== 'chord' && event.postfixes.every(mark => !/^f[1-5]$/.test(mark)),
    )).toBe(true)
    expect(measures.flatMap((measure, index) => measure.right?.startsWith('rptend') ? [index + 1] : []))
      .toEqual([28, 73])
    expect(measures[28]!.left).toBe('rptstart')
    const passes = measurePlaybackPasses(measures)
    expect(measures.map(measure => [...passes.get(measure)!])).toEqual(Array.from({ length: 73 }, () => [1, 2]))
    // Keep the original low thematic entries and the upper turn in the closing scale.
    expect(measures[30]!.events[1]!.pitches).toEqual(['5dd'])
    expect(measures[49]!.events[0]!.pitches).toEqual(['4d'])
    expect(measures[52]!.events[0]!.pitches).toEqual(['1d'])
    expect(measures[68]!.events.map(event => event.pitches[0])).toEqual([
      '5=e', '6e', '7e', '1ee', '2ee', '3ee', '2ee', '1ee', '7e', '6e', '5e', '4e', '3e', '2e', '1e',
    ])
    expect(measures[22]!.events.map(event => event.beats)).toEqual([1.5, ...Array(4).fill(0.125), ...Array(4).fill(0.5)])
    expect(measures[25]!.events[0]!.postfixes).toContain('ac((5e 6e))')
    expect(measures[70]!.events[0]!.postfixes).toContain('ac((1e 2e))')
  })

  it('includes The Swan with complete 6/4 bars and its final tied sustain', async () => {
    const entry = presetScores.find(score => score.sourcePath === 'tian_e_01.m3n')
    expect(entry?.title).toBe('天鹅')
    expect(await loadPresetScore(entry!.slug)).toBe(theSwan)
    expect(validateM3NDiagnostics(theSwan)).toEqual([])
    const document = parseM3NDocument(theSwan)
    expect(document).toMatchObject({ key: 'Bb', meterCount: 6, meterUnit: 4, tempo: 72 })
    const measures = document.parts.get('score')!.melody.filter(measure => measure.events.length)
    expect(measures).toHaveLength(27)
    expect(measures.map(measure => measure.events.reduce((sum, event) => sum + event.beats, 0)))
      .toEqual(Array(27).fill(6))
    expect(measures[0]!.events.map(event => event.beats)).toEqual(Array(24).fill(0.25))
    expect(measures[16]!.events.map(event => event.pitches)).toEqual([['7b'], ['7=']])
    const ending = [...measures[25]!.events, ...measures[26]!.events]
    expect(ending.slice(0, 3).map(event => [event.beats, event.tie])).toEqual([[6, true], [3, true], [0.5, false]])
  })

  it('preserves Besame Mucho houses, repeat scope and reference rhythms', () => {
    expect(validateM3NDiagnostics(besameMucho)).toEqual([])
    const document = parseM3NDocument(besameMucho)
    expect(document.tempo).toBe(100)
    const measures = document.parts.get('score')!.melody.filter(measure => measure.events.length)
    expect(measures).toHaveLength(63)
    expect(measures.flatMap((measure, index) => measure.ending === '1' ? [index + 1] : [])).toEqual([14, 15, 16])
    expect(measures.flatMap((measure, index) => measure.ending === '2' ? [index + 1] : []))
      .toEqual(Array.from({ length: 33 }, (_, index) => index + 17))
    expect(measures.flatMap((measure, index) => measure.right === 'rptend' ? [index + 1] : [])).toEqual([16, 57])
    const passes = measurePlaybackPasses(measures)
    expect(measures.map(measure => [...passes.get(measure)!])).toEqual([
      ...Array.from({ length: 13 }, () => [1, 2]),
      ...Array.from({ length: 3 }, () => [1]),
      ...Array.from({ length: 33 }, () => [2]),
      ...Array.from({ length: 4 }, () => [1]),
      ...Array.from({ length: 4 }, () => [1, 2]),
      ...Array.from({ length: 6 }, () => [1]),
    ])
    for (const index of [4, 31, 45]) {
      expect(measures[index]!.events.map(event => event.beats)).toEqual([0.5, 1, 0.5, 0.5, 1, 0.5])
    }
    expect(measures[42]!.events.map(event => event.beats)).toEqual([2, 1, 0.5, 0.5])
    expect(measures.every(measure => measure.events.reduce((sum, event) => sum + event.beats, 0) === 4)).toBe(true)
    expect(measures.slice(0, 16).every(measure => measure.left !== 'rptstart')).toBe(true)
    expect(measures[36]!.events.flatMap(event => event.postfixes)).toContain('ac(5)')
    expect(measures[60]!.events[0]!.postfixes).toContain('ac(7 1e 7)')
  })

  it('contains uniquely identified scores with usable metadata', () => {
    expect(presetScores.length).toBeGreaterThan(0)
    expect(new Set(presetScores.map((score) => score.slug)).size).toBe(presetScores.length)
    expect(presetScores.every((score) => score.title)).toBe(true)
    expect(presetScores.every((score) => score.keySignature && score.timeSignature && score.tempo > 0)).toBe(true)
  })

  it('returns no source for an unknown score and keeps bodies out of the index', async () => {
    expect(await loadPresetScore('missing-score')).toBeNull()
    expect(presetScores.every(score => !('source' in score))).toBe(true)
  })

  it('converts every lazy score with valid source mappings', async () => {
    const failures: string[] = []

    for (const score of presetScores) {
      try {
        const source = await loadPresetScore(score.slug)
        if (source === null) throw new Error('Missing score body')
        const result = m3nToMei(source)
        if (!result.mei.startsWith('<?xml') || !result.mei.includes('<scoreDef')) {
          failures.push(`${score.slug}: missing MEI score`)
        }
        for (const range of result.sourceMap) {
          if (
            range.sourceStart < 0 ||
            range.sourceEnd > source.length ||
            range.sourceStart >= range.sourceEnd ||
            !range.xmlId
          ) {
            failures.push(`${score.slug}: invalid source map`)
            break
          }
        }
      } catch (error) {
        failures.push(`${score.slug}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    expect(failures).toEqual([])
  })
})
