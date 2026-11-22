import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, resolveScorePitches, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../scores/hou_lai_01.m3n', import.meta.url), 'utf8')
const document = parseM3NDocument(source)
const printed = document.parts.get('score')!.melody.filter(bar => bar.events.length)
const performed = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
const bars = (first: number, last: number) => printed.slice(first - 1, last)
const events = (measures: typeof printed) => {
  const pitches = resolveScorePitches(measures)
  return measures.flatMap(bar => bar.events.map(event => ({
    pitches: pitches.get(event) ?? [], beats: event.beats, tie: event.tie ?? false,
    postfixes: event.postfixes, dynamic: event.dynamic ?? null, tempo: event.tempo,
  })))
}
const lyrics = () => {
  const { lyricsByEvent } = deriveScoreInteraction(document)
  const byId = new Map([...scoreEventIds(document)].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
  return compileScorePerformance(document).elements.filter(element => element.voice === 'score:melody')
    .flatMap(element => (byId.get(element.xmlId) ?? [])
      .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
      .map(lyric => lyric.text)).join('')
}

describe('Hou Lai with a repeated bridge and D.S. chorus', () => {
  it('uses E-flat and three endings without source diagnostics', () => {
    expect(document.key).toBe('Eb')
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(document.order).toBeUndefined()
    expect(document.sections ?? []).toEqual([])
    expect(printed).toHaveLength(62)
    expect(printed.flatMap((bar, index) => bar.left === 'rptstart' ? [index + 1] : [])).toEqual([42])
    expect(printed.flatMap((bar, index) => bar.right === 'rptend' ? [index + 1] : [])).toEqual([55])
    expect(printed.flatMap((bar, index) => bar.ending ? [[index + 1, bar.ending]] : [])).toEqual([[54, '1'], [55, '1'], [56, '2'], [57, '3']])
    expect(bars(41, 42).map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0))).toEqual([4, 4])
    expect(bars(54, 57).map(bar => bar.events.reduce((sum, event) => sum + event.beats, 0))).toEqual([4, 4, 4, 4])
  })

  it('repeats the bridge, takes ending two, then returns to the chorus and takes ending three', () => {
    // One-based printed bar route, independently specified for the updated arrangement.
    const expected = [...bars(1, 55), ...bars(42, 53), ...bars(56, 56), ...bars(47, 53), ...bars(57, 62)]
    expect(performed).toHaveLength(81)
    expect(events(performed)).toEqual(events(expected))
    expect(compileScorePerformance(document).beats).toBe(312)
  })

  it('sings the bridge twice and the chorus four times in the intended order', () => {
    const chorus = '后来我总算学会了如何去爱可惜你早已远去消失在人海后来终于在眼泪中明白有些人一旦错过就不再'
    const verse = '栀子花白花瓣落在我蓝色百褶裙上爱你你轻声说我低下头闻见一阵芬芳那个永恒的夜晚十七岁仲夏你吻我的那个夜晚让我往后的时光每当有感叹总想起当天的星光那时候的爱情为什么就能那样简单而又是为什么人年少时一定要让深爱的人受伤在这相似的深夜里你是否一样也在静静追悔感伤如果当时我们能不那么倔强现在也不那么遗憾'
    const bridge = '你都如何回忆我带着笑或是很沉默这些年来有没有人能让你不寂寞'
    const coda = '永远不会再重来有一个男孩爱着那个女孩'
    expect(lyrics()).toBe(chorus + verse + bridge + chorus + bridge + chorus + chorus + coda)
  })
})
