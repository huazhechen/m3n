import { compileScorePerformance, deriveScoreInteraction, parseM3NDocument, scoreEventIds, unfoldScorePerformance, validateM3NDiagnostics } from '@m3n/notation'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../scores/si_le_dou_yao_ai_01.m3n', import.meta.url), 'utf8')
const document = parseM3NDocument(source)
const printed = document.parts.get('score')!.melody.filter(bar => bar.events.length)
const ids = scoreEventIds(document)

describe('Si Le Dou Yao Ai screenshot transcription', () => {
  it('preserves the original pitches, timing, alternate endings and meter changes', () => {
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(document.key).toBe('C')
    expect(printed).toHaveLength(38)
    expect(printed[0]!.events.map(event => [event.kind, event.pitches, event.beats])).toEqual([
      ['rest', [], 0.5], ['note', ['3'], 0.5],
    ])
    expect(printed[1]!.events.map(event => [event.pitches, event.beats])).toEqual([
      [['1e'], 1], [['1e'], 0.5], [['1e'], 0.5], [['1e'], 1.5], [['2e'], 0.5],
    ])
    expect(printed[15]!.events.at(-1)!.pitches).toEqual(['5#d'])
    expect(printed.slice(8, 25).every(bar => bar.ending === '1,2')).toBe(true)
    expect(printed[25]!.ending).toBe('3')
    expect(printed[34]!.events.map(event => [event.meterCount, event.meterUnit, event.beats])).toEqual(Array(4).fill([2, 4, 0.5]))
    expect(printed[35]!.events[0]!.meterCount).toBe(4)
  })

  it('plays two full repetitions, then D.S. to the third ending and coda exactly once', () => {
    const barById = new Map(printed.flatMap((bar, index) => bar.events.map(event => [ids.get(event)!, index + 1])))
    const route = unfoldScorePerformance(document).parts.get('score')!.melody.filter(bar => bar.events.length)
      .map(bar => barById.get(bar.events[0]!.playbackId!.replace(/-rend\d+$/, '')))
    const range = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, index) => first + index)
    expect(route).toEqual([...range(1, 25), ...range(2, 25), ...range(2, 8), ...range(26, 38)])
    expect(compileScorePerformance(document).beats).toBe(271)
  })

  it('retains complete sung lyrics through the shared endings and final verse', () => {
    const { lyricsByEvent } = deriveScoreInteraction(document)
    const byId = new Map([...ids].map(([event, id]) => [id, lyricsByEvent.get(event) ?? []]))
    const lyrics = compileScorePerformance(document).elements.filter(element => element.voice === 'score:melody')
      .flatMap(element => (byId.get(element.xmlId) ?? [])
        .filter(lyric => lyric.kind === 'text' && (!lyric.passes || lyric.passes.has(element.rendition)))
        .map(lyric => lyric.text)).join('')
    const chorus = '了都要爱不淋漓尽致不痛快感情多深只有这样才足够表白死了都要爱不哭到微笑不痛快宇宙毁灭心还'
    const verse = '在把每天当成是末日来相爱一分一秒都美到泪水掉下来不理会别人是看好或看坏只要你勇敢跟我来爱不用刻意安排凭感觉去亲吻相拥就会很愉快享受现在别一开怀就怕受伤害许多奇迹我们相信才会存在死'
    const coda = '在穷途末路都要爱不极度浪漫不痛快发会雪白土会掩埋思念不腐坏到绝路都要爱不天荒地老不痛快不怕热爱变火海爱到沸腾才精彩'
    expect(lyrics).toBe('死' + chorus + verse + chorus + verse + chorus + coda)
  })
})
