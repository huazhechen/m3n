import { describe, expect, it } from 'vitest'
import { m3nToMei, parseM3NDocument, parseM3NDocumentStructure, measurePlaybackPasses, validateM3NDiagnostics } from '@m3n/notation'
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
    ['zhi_ai_li_si', '致爱丽丝', elise, 87, 1.5],
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
      for (const index of [0, 10, 26, 64]) expected[index] = 0.5
      for (const index of [8, 9, 24, 25, 63]) expected[index] = 1
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
    const eliseBars = bars(elise)
    expect(parseM3NDocument(elise).order).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'D'])
    const elisePasses = measurePlaybackPasses(eliseBars)
    expect([...elisePasses.get(eliseBars[0]!)!]).toEqual([1, 2])
    expect([...elisePasses.get(eliseBars[10]!)!]).toEqual([1, 2])
    expect([...elisePasses.get(eliseBars[43]!)!]).toEqual([1, 2])
    expect(eliseBars[82]!.events.map(event => event.beats)).toEqual([0.5, 0.5, 0.5])
    expect(eliseBars[84]!.events[1]!.pitches).toEqual(['6ee', '1eee', '3eee'])
  })

  it('uses the reference Love Like Tide melody and joins each chorus pickup correctly', async () => {
    const entry=presetScores.find(score=>score.sourcePath==='ai_ru_chao_shui_01.m3n')!
    expect(await loadPresetScore(entry.slug)).toBe(loveLikeTide)
    expect(validateM3NDiagnostics(loveLikeTide)).toEqual([])
    const document=parseM3NDocument(loveLikeTide)
    expect(document).toMatchObject({key:'E',meterCount:4,meterUnit:4,tempo:80,order:['A','B','C1','B','C2']})
    expect(document.sections!.map(section=>section.name)).toEqual(['A','B','C1','C2'])
    const bars=document.parts.get('score')!.melody.filter(bar=>bar.events.length)
    expect(bars).toHaveLength(37)
    const beats=Array<number>(37).fill(4)
    beats[17]=beats[35]=3
    beats[18]=beats[27]=1
    expect(bars.map(bar=>bar.events.reduce((sum,event)=>sum+event.beats,0))).toEqual(beats)
    expect(bars[0]!.events.map(event=>[event.pitches,event.beats]))
      .toEqual([[[],1],[['3'],0.25],[['5'],0.25],[['1e'],0.25],[['7'],0.25],[['7'],0.25],[['1e'],0.75],[['1e'],1]])
    expect(document.intervals.some(interval=>interval.kind==='inst')).toBe(false)
    expect(bars[27]!.left).toBe('rptstart')
    expect(bars[35]!.right?.startsWith('rptend')).toBe(true)
    expect(bars[35]!.ending).toBe('1')
    expect(bars[36]!.ending).toBe('2')
    expect(document.alternatives).toHaveLength(2)
    expect(bars[24]!.events.find(event=>event.kind==='tuplet')!.pitches).toEqual(['7','5','5'])
    expect(bars[33]!.events.find(event=>event.kind==='tuplet')!.pitches).toEqual(['7','5','5'])
    expect(m3nToMei(loveLikeTide).diagnostics.filter(item=>item.severity==='error')).toEqual([])
  })

  it('uses the reference Salut melody with lower harmony and a shared six-beat A ending', async () => {
    const entry=presetScores.find(score=>score.sourcePath==='ai_de_li_zan_01.m3n')!
    expect(await loadPresetScore(entry.slug)).toBe(salut)
    expect(validateM3NDiagnostics(salut)).toEqual([])
    const document=parseM3NDocument(salut)
    expect(document).toMatchObject({key:'D',meterCount:4,meterUnit:4,tempo:80,order:['A','B1','A','B2']})
    expect(document.sections!.map(section=>section.name)).toEqual(['A','B1','B2'])
    const part=document.parts.get('score')!
    const bars=part.melody.filter(measure=>measure.events.length)
    expect(bars).toHaveLength(38)
    expect(bars.map(bar=>bar.events.reduce((sum,event)=>sum+event.beats,0))).toEqual(Array(38).fill(4))
    expect(part.bass.flatMap(bar=>bar.events)).toEqual([])
    expect(bars.flatMap(bar=>bar.events).every(event=>event.kind!=='chord')).toBe(true)
    expect([0,16,25,32].map(i=>bars[i]!.events[0]!.key)).toEqual(['D','F','F','F'])
    // The same 4+2 beat tied 6 ends both visits to A; two rests complete its last bar.
    expect(bars[23]!.events.map(event=>[event.pitches,event.beats,event.tie])).toEqual([[['6e'],4,true]])
    expect(bars[24]!.events.map(event=>[event.pitches,event.beats])).toEqual([[['6e'],2],[[],2]])
    expect(bars[24]!.right).toBe('dbl')
    // Both B variants begin after the removed interlude, without the old sustained 6.
    expect(bars[25]!.events.map(event=>[event.pitches,event.beats])).toEqual([[[],1],[[],1],[[],1],[[],0.5],[['5'],0.5]])
    expect(bars[32]!.events.map(event=>event.pitches)).toEqual([['3'],['5d'],['3'],['2'],['1'],['7d'],['1']])
    // Choose the lower triplets and the four lower closing whole notes from the reference harmony.
    expect(bars[31]!.events.map(event=>event.pitches)).toEqual([['4#','3','2'],['1#','2','3'],['3'],[]])
    expect(bars.slice(34).map(bar=>bar.events.map(event=>[event.pitches,event.beats])))
      .toEqual(['5d','6d','5d','4d'].map(pitch=>[[[pitch],4]]))
    expect(salut).not.toMatch(/间奏|interlude|\{rest=/)
    expect(m3nToMei(salut).diagnostics.filter(item=>item.severity==='error')).toEqual([])
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
      .toEqual(Array.from({ length: 3 }, (_, index) => index + 17))
    expect(measures.flatMap((measure, index) => measure.right === 'rptend' ? [index + 1] : [])).toEqual([16, 57])
    const passes = measurePlaybackPasses(measures)
    expect(measures.map(measure => [...passes.get(measure)!])).toEqual([
      ...Array.from({ length: 13 }, () => [1, 2]),
      ...Array.from({ length: 3 }, () => [1]),
      ...Array.from({ length: 3 }, () => [2]),
      ...Array.from({ length: 34 }, () => [1]),
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
    expect(presetScores.map(score => score.sourcePath)).not.toContain('xi_yang_yang_01.m3n')
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
        const sections = parseM3NDocumentStructure(source).sections
        if (sections.some(section => section.name) && sections.some(section => !section.name && section.phrases.length)) {
          failures.push(`${score.slug}: music outside a named section`)
        }
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
