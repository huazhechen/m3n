import { analyzeM3N, measurePlaybackPasses, parseM3NDocument, parseM3NDocumentStructure, resolveScorePitches, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import besameMucho from '../scores/besame_mucho_01.m3n?raw'
import polka from '../scores/dan_huang_guan_bo_er_ka_01.m3n?raw'
import maple from '../scores/feng_01.m3n?raw'
import mozartK545 from '../scores/mozart_k545_01.m3n?raw'
import smoke from '../scores/yan_hua_yi_leng_01.m3n?raw'
import always from '../scores/yong_yuan_tong_zai_01.m3n?raw'
import elise from '../scores/zhi_ai_li_si_01.m3n?raw'
import referenceMelodies from './fixtures/numbered-reference-melodies.json'
import webReferences from './fixtures/kuaiyuepu-reference-melodies.json'
import { loadPresetScore, presetScores } from './samples'

describe('bundled score corpus', () => {
  it.each([
    ['feng', '枫', maple, 42, 4],
    ['yan_hua_yi_leng', '烟花易冷', smoke, 41, 4],
    ['dan_huang_guan_bo_er_ka', '单簧管波尔卡', polka, 43, 2],
    ['zhi_ai_li_si', '致爱丽丝', elise, 58, 3],
    ['yong_yuan_tong_zai', '永远同在', always, 35, 3],
  ] as const)('loads the complete reference melody %s with valid bar durations', async (id, title, source, count, beats) => {
    const entry = presetScores.find(score => score.sourcePath === `${id}_01.m3n`)
    expect(entry?.title).toBe(title)
    expect(await loadPresetScore(entry!.slug)).toBe(source)
    expect(validateM3NDiagnostics(source)).toEqual([])
    const part = parseM3NDocument(source).parts.get('score')!
    const measures = part.melody.filter(measure => measure.events.length)
    expect(measures).toHaveLength(count)
    const expected = Array<number>(count).fill(beats)
    if (id === 'yan_hua_yi_leng') {
      for (const index of [0, 33, 40]) expected[index] = 2
      for (const index of [16, 34, 35]) expected[index] = 3
      for (const index of [17, 36]) expected[index] = 1
    }
    if (id === 'dan_huang_guan_bo_er_ka') {
      for (const index of [16,25,42]) expected[index] = 1.5
      for (const index of [0,17,26]) expected[index] = 0.5
    }
    if (id === 'zhi_ai_li_si') { expected[0] = 1; expected[57] = 2 }
    expect(measures.map(measure => measure.events.reduce((sum, event) => sum + event.beats, 0)))
      .toEqual(expected)
    expect(part.bass.flatMap(measure => measure.events)).toEqual([])
    expect(measures.flatMap(measure => measure.events).every(event =>
      event.kind !== 'chord' && event.postfixes.every(mark => !/^f[1-5]$/.test(mark)),
    )).toBe(true)
  })

  it('retains reference repeat scopes, modulation and fast subdivisions', () => {
    const bars = (source: string) => parseM3NDocument(source).parts.get('score')!.melody.filter(measure => measure.events.length)
    expect(parseM3NDocument(smoke).order).toBeUndefined()
    const polkaBars = bars(polka)
    expect(polkaBars.every(bar=>!bar.ending && bar.left!=='rptstart' && bar.right!=='rptend')).toBe(true)
    expect(parseM3NDocument(polka).order).toEqual(['A','A','B','B','A','C','C','A','A'])
    expect([0,17,26].map(index=>polkaBars[index]!.events[0]!.key)).toEqual(['C','G','F'])
    const mapleBars = bars(maple)
    expect(mapleBars[40]!.events[0]!.key).toBe('Db')
    expect(mapleBars[0]!.events[0]!.beats).toBe(0.5)
    const eliseBars = bars(elise)
    expect(parseM3NDocument(elise).order).toBeUndefined()
    expect(elise.match(/2=e/g)).toHaveLength(7)
    expect(eliseBars.filter(bar=>bar.ending === '2')).toHaveLength(2)
  })

  it('keeps the first 35 bars of Always With Me as a complete solo excerpt', () => {
    const document = parseM3NDocument(always)
    expect(document.order).toBeUndefined()
    expect(always).not.toMatch(/---V|:\|\||\|\|:|^===/m)
    expect(always.trim()).toMatch(/1~ 1~ 1 \|\|\|$/)
    const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(bars).toHaveLength(35)
    const reference = webReferences.find(reference => reference.id === 'yong_yuan_tong_zai')!
    const itinerary = [
      ...Array.from({ length: 35 }, (_, index) => index + 1),
    ]
    // Preserve every original bar boundary as well as the full event itinerary.
    expect(bars.map(bar => bar.events.map(event => event.beats))).toEqual(
      itinerary.map(number => reference.events.filter(event => event.bar === number).map(event => event.beats)),
    )
    expect(bars.every(bar => !bar.ending && bar.events.every(event => event.meterCount === 3 && event.meterUnit === 4))).toBe(true)
    expect(bars.reduce((sum, bar) => sum + bar.events.reduce((n, event) => n + event.beats, 0), 0)).toBe(105)
  })

  const sources: Record<string, string> = {feng:maple,yan_hua_yi_leng:smoke,zhi_ai_li_si:elise,yong_yuan_tong_zai:always}
  const referenceEvents = (source: string, expand: boolean) => {
    const parsed=parseM3NDocument(source)
    const document=expand ? unfoldScorePerformance(parsed) : parsed
    const bars=document.parts.get('score')!.melody
    const resolved=resolveScorePitches(bars)
    return bars.flatMap(bar=>bar.events.map(event=>{
      const pitch=resolved.get(event)?.[0]
      const [name,octave,accidental]=pitch?.split(':') ?? []
      const degree: Record<string,number>={c:0,d:2,e:4,f:5,g:7,a:9,b:11}
      const alteration: Record<string,number>={s:1,f:-1,ss:2,ff:-2}
      return {pitch:pitch ? 12*(Number(octave)+1)+degree[name]!+(alteration[accidental!]??0) : null, beats:event.beats,tie:event.tie??false}
    }))
  }
  // 城→门 and 笛→声: keep the historical reference IDs, extend high 3
  // and remove only the following high 2 passing attack on every visit.
  const smokeSlides = new Map<string, { pitch: number; beats: number; tie: boolean } | null>([
    ['note143', { pitch: 76, beats: 0.5, tie: false }], ['note144', null],
    ['note191', { pitch: 76, beats: 0.5, tie: false }], ['note192', null],
  ])
  it.each(webReferences.filter(reference => reference.id !== 'feng'))('matches every written reference event for $id', reference=>{
    const original=reference.events
    const events=reference.id==='yan_hua_yi_leng'
      // Keep separate second/third endings for D.S. and the continuation into C.
      ? [...original.slice(0,206), ...original.slice(299,302), ...original.slice(299)]
      : reference.id==='yong_yuan_tong_zai'
      // User selected the complete first 35 bars for the solo excerpt.
      ? original.filter(event=>event.bar<=35)
      : original
    const expected=events.flatMap(event=>{
      if(reference.id==='yan_hua_yi_leng' && smokeSlides.has(event.referenceId)) {
        return smokeSlides.get(event.referenceId) ? [smokeSlides.get(event.referenceId)!] : []
      }
      const {pitch,beats,tie}=event
      return [{pitch,beats,tie}]
    })
    expect(referenceEvents(sources[reference.id]!,false)).toEqual(expected)
  })
  // Requested seven written vocal-slide simplifications, including the transposed final chorus.
  // Keys are event indexes in the unchanged web reference; null removes a passing attack.
  const mapleSlides = new Map<number, { pitch: number; beats: number; tie: boolean } | null>([
    [144, { pitch: 77, beats: 0.5, tie: true }], [145, { pitch: 77, beats: 0.5, tie: false }],
    [152, { pitch: 81, beats: 1, tie: false }], [153, null],
    [211, { pitch: 77, beats: 0.5, tie: true }], [212, { pitch: 77, beats: 0.5, tie: false }],
    [219, { pitch: 81, beats: 1, tie: false }], [220, null],
    [253, { pitch: 74, beats: 0.75, tie: false }], [254, null],
    [256, { pitch: 72, beats: 4, tie: false }], [257, null], [258, null], [259, null],
    [301, { pitch: 73, beats: 1, tie: false }], [302, null],
    [360, { pitch: 78, beats: 0.5, tie: true }], [361, { pitch: 78, beats: 0.5, tie: false }],
    [368, { pitch: 82, beats: 1, tie: false }], [369, null],
    [427, { pitch: 78, beats: 0.5, tie: true }], [428, { pitch: 78, beats: 0.5, tie: false }],
    [435, { pitch: 82, beats: 1, tie: false }], [436, null],
    [472, { pitch: 75, beats: 0.75, tie: false }], [473, null],
    [475, { pitch: 73, beats: 4, tie: false }], [476, null], [477, null], [478, null],
  ])
  it.each(webReferences)('matches the reference playback itinerary for $id',reference=>{
    const indexes=reference.playbackEventIndexes.filter(index=>reference.id!=='feng' || index!==5)
    const selectedIndexes=reference.id==='yong_yuan_tong_zai'
      ? reference.events.flatMap((event,index)=>event.bar<=35 ? [index] : [])
      : indexes
    const expected=selectedIndexes.flatMap(index=>{
      if(reference.id==='feng' && index===467) return [{pitch:78,beats:0.25,tie:false},{pitch:78,beats:0.25,tie:true}]
      if(reference.id==='feng' && index===25) return [{pitch:null,beats:0.25,tie:false},{pitch:76,beats:0.25,tie:false}]
      if(reference.id==='feng' && index===26) return [{pitch:74,beats:0.25,tie:false}]
      if(reference.id==='feng' && mapleSlides.has(index)) return mapleSlides.get(index) ? [mapleSlides.get(index)!] : []
      const event=reference.events[index]!
      if(reference.id==='yan_hua_yi_leng' && smokeSlides.has(event.referenceId)) {
        return smokeSlides.get(event.referenceId) ? [smokeSlides.get(event.referenceId)!] : []
      }
      const {pitch,beats,tie}=reference.events[index]!
      return [{
        pitch:reference.id==='feng' && index===35 ? 72 : pitch,
        beats:reference.id==='feng' && index===4 ? 0.5 : beats,
        tie:reference.id==='feng' && index===34 ? true : tie,
      }]
    })
    expect(referenceEvents(sources[reference.id]!,true)).toEqual(expected)
  })

  it.each(webReferences.filter(reference=>'lyricText' in reference))('preserves every reference lyric character for $id',reference=>{
    const document=parseM3NDocument(sources[reference.id]!)
    // Read each verse across source phrases instead of interleaving the verses of each phrase.
    const blocks=parseM3NDocumentStructure(sources[reference.id]!).sections.flatMap(section=>{
      const starts=new Set(section.phrases.map(phrase=>phrase.melody?.start))
      const sectionBlocks=document.lyrics.filter(block=>starts.has(block.targetStart))
      return [...new Set(sectionBlocks.map(block=>block.range))]
        .flatMap(range=>sectionBlocks.filter(block=>block.range===range))
    })
    const lyrics=blocks.flatMap(block=>block.syllables.filter(syllable=>syllable.kind==='text').map(syllable=>syllable.text)).join('')
    const mapleWrittenLyrics = (text: string) => {
      const chorus = text.indexOf('缓缓掉落的枫叶'), thirdEnding = text.indexOf('只剩挥散不去的难过',chorus)
      const bridge = text.indexOf('在山腰间'), finalChorus = text.indexOf('缓缓掉落的枫叶',bridge)
      const finalEnding = text.indexOf('自秋末的眼泪',finalChorus)
      const firstEnding = text.indexOf('总在回忆里才看的清')
      const secondVerse = firstEnding + '总在回忆里才看的清'.length
      const secondEnding = text.indexOf('只剩挥散不去的难过')
      return text.slice(0, firstEnding) + text.slice(secondVerse, secondEnding)
        + text.slice(firstEnding, secondVerse) + text.slice(secondEnding, chorus)
        + text.slice(secondEnding, chorus)
        + text.slice(chorus, thirdEnding) + text.slice(finalEnding) + text.slice(bridge, finalChorus)
    }
    const expected=reference.id==='feng'
      ? mapleWrittenLyrics(reference.lyricText!)
      : reference.id==='yan_hua_yi_leng'
        ? reference.lyricText!.replace(/(雨纷纷旧故里[\s\S]*?是我们)([\s\S]*?)\1/, '$1$2们们')
        : reference.lyricText
    expect(lyrics.replace(/[^\u3400-\u9fff]/g,'')).toBe(expected)
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
    // The uploaded numbered score identifies these as rests/chords in the melody, not bass runs.
    expect(measures[30]!.events.map(event=>[event.pitches,event.beats])).toEqual([
      [[],1],[[],1],[[],0.25],[['5'],0.25],[['7b'],0.25],[['6'],0.25],[['5'],0.25],[['4'],0.25],[['3'],0.25],[['2'],0.25],
    ])
    for(const index of [34,35,36,37,38,39]) {
      expect(measures[index]!.events[0]!.kind).toBe('rest')
      expect(measures[index]!.events.at(-1)!.kind).toBe('rest')
      expect(measures[index]!.events.map(event => event.beats)).toEqual([...Array(8).fill(0.25), 1, 1])
      expect(measures[index]!.events.at(-1)!.beats).toBe(1)
    }
    for(const [index,pitch] of [[49,'6'],[50,'5'],[51,'4'],[52,'3']] as const) {
      expect(measures[index]!.events.map(event=>[event.pitches,event.beats])).toEqual([[[pitch],1],[[],1],[[],1],[[pitch],1]])
    }
    expect(measures[68]!.events.map(event => event.pitches[0])).toEqual([
      '5=', '6', '7', '1e', '2e', '3e', '2e', '1e', '7', '6', '5', '4', '3', '2', '1',
    ])
    expect(measures[22]!.events.map(event => event.beats)).toEqual([1.5, ...Array(4).fill(0.125), ...Array(4).fill(0.5)])
    expect(measures[25]!.events[0]!.postfixes.some(mark => mark.startsWith('ac('))).toBe(false)
    expect(measures[70]!.events[0]!.postfixes.some(mark => mark.startsWith('ac('))).toBe(false)
  })


  it.each(referenceMelodies)('matches every melody bar checked against the uploaded numbered reference: $id', reference => {
    const source=reference.id==='mozart_k545'?mozartK545:polka
    const document=parseM3NDocument(source)
    const bars=document.parts.get('score')!.melody.filter(bar=>bar.events.length)
    if(reference.id==='dan_huang_guan_bo_er_ka') {
      const expanded=unfoldScorePerformance(document)
      const measures=expanded.parts.get('score')!.melody
      const pitches=resolveScorePitches(measures)
      let dynamic='mf'
      const playback=measures.flatMap(bar=>bar.events.map(event=>{
        if(event.dynamic)dynamic=event.dynamic
        return {pitches:pitches.get(event)?.map(pitch=>pitch.replace(/:n$/,':')),beats:event.beats,tie:event.tie,postfixes:event.postfixes,dynamic,kind:event.kind}
      }))
      // User removed the 3.5-beat introduction and final half-beat rest,
      // unified dynamics, and normalized each A pickup to the fourth pass's staccato.
      const withoutDynamics = <T extends {dynamic: string}>({dynamic: _dynamic, ...event}: T) => event
      const pickupOnsets = new Set([0, 32, 96, 192, 224].flatMap(beat => [beat, beat + 0.25]))
      let onset = 0
      const expectedPlayback = reference.playback!.slice(4,-1).map(event => {
        const normalized = withoutDynamics(event)
        if (pickupOnsets.has(onset)) normalized.postfixes = ['tip']
        onset += event.beats
        return normalized
      })
      expect(playback.map(withoutDynamics)).toEqual(expectedPlayback)
      expect(playback).toHaveLength(767)
      expect(playback.reduce((sum,event)=>sum+event.beats,0)).toBe(256)
      expect(document).toMatchObject({tempo:120,hasExplicitTempo:true})
    } else {
      expect(bars.map(bar=>({key:bar.events[0]!.key,notes:bar.events.map(event=>`${event.pitches.join('+')||'0'}:${event.beats}${event.tie?'~':''}`).join(' ')})))
        .toEqual(reference.bars)
    }
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

  it('analyzes every lazy score with valid source mappings', async () => {
    const failures: string[] = []

    for (const score of presetScores) {
      try {
        const source = await loadPresetScore(score.slug)
        if (source === null) throw new Error('Missing score body')
        const sections = parseM3NDocumentStructure(source).sections
        if (sections.some(section => section.name) && sections.some(section => !section.name && section.phrases.length)) {
          failures.push(`${score.slug}: music outside a named section`)
        }
        const result = analyzeM3N(source)
        for (const range of result.interaction.sourceMap) {
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
