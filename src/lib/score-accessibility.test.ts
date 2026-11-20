import { describe, expect, it } from 'vitest'
import { parseM3NDocument, validateM3NDiagnostics } from '@m3n/notation'
import { describeAccessibleScore } from './score-accessibility'

function read(source: string, options: Parameters<typeof describeAccessibleScore>[1] = {}) {
  expect(validateM3NDiagnostics(source)).toEqual([])
  return describeAccessibleScore(parseM3NDocument(source), options)
}
const all = (score: ReturnType<typeof read>) => score.measures.flatMap(m => m.voices.flatMap(v => v.events)).join('\n')

describe('front-end accessible score descriptions', () => {
  it('describes pitches, octave, duration, rests, lyrics and tied continuations', () => {
    const text = read('{title=试唱}{key=C}{4/4}\nN: 1e (2#d 0) 3~ 3 |||\nL: 春夏天')
    expect(text.title).toBe('试唱，无障碍读谱')
    expect(all(text)).toContain('哆，音级1，音高C5')
    expect(all(text)).toContain('升来，音级2，音高降E3')
    expect(all(text)).toContain('八分休止符，0.5拍')
    expect(all(text)).toContain('延续前一个同音，不重新发音')
    expect(all(text)).toContain('歌词“春”')
  })
  it('updates absolute pitch and key with transposition and keeps movable degrees', () => {
    const score = parseM3NDocument('{key=Bb}{2/4}{60qpm}\nN: 1 2 |||'), before = structuredClone(score)
    const text = describeAccessibleScore(score, { transpose: 3, tempoScale: 2 })
    expect(text.summary).toContain('降D大调')
    expect(text.summary).toContain('每分钟120拍')
    expect(all(text)).toContain('哆，音级1，音高升C5')
    expect(score).toEqual(before)
  })
  it('uses fixed solfege or staff pitch without changing the semantic score', () => {
    expect(all(read('{key=D}{2/4}\nN: 1 2 |||', { notationMode: 'fixed' }))).toContain('固定唱名来，音高D4')
    expect(all(read('{key=D}{2/4}\nN: 1 2 |||', { notationMode: 'staff' }))).not.toContain('音级')
  })
  it('reads compound-meter beat units, dotted notes and bass separately', () => {
    const text = read('{6/8}\nN: 1. 2. |||\nB: 1d. 2d. |')
    expect(text.summary).toContain('以8分音符为一拍')
    expect(text.measures[0]!.voices.map(v => v.name)).toEqual(['旋律', '低音'])
    expect(all(text)).toContain('附点四分音符，3拍')
    expect(all(text)).toContain('第4拍')
  })
  it('retains every verse and states actual ending modulation', () => {
    const text = read('{key=C}{2/4}\nN: ||: 1 2 |\nL1: 春天\nL2: 秋天\n---V1\nN: {key=G}3 4 :||\n---V2\nN: {key=G}5 6 |||')
    expect(all(text)).toContain('第1遍歌词“春”')
    expect(all(text)).toContain('第2遍歌词“秋”')
    expect(text.measures[2]!.label).toContain('第2遍房子')
    expect(text.measures[2]!.label).toContain('转调至G大调')
    expect(text.measures[1]!.label).toContain('反复结束，共演奏2遍')
  })
  it('describes the To Coda exit and coda entry', () => {
    const score = read('{2/4}\nN: ||: 1 2{tocoda} |\n---\nN: 3 4 :||\n---\nN: {coda}5 6 |||')
    expect(score.measures[0]!.label).toContain('返回后跳至尾声')
    expect(score.measures[2]!.label).toContain('尾声起点')
  })
  it('associates tuplet lyrics with each sounded slot and describes chords', () => {
    const text = read('{4/4}\nN: [1 0 3:2] [135:h]^ |||\nL: 春天好')
    expect(all(text)).toContain('3连音，总时值2拍')
    expect(all(text)).toMatch(/第1音：.*歌词“春”/)
    expect(all(text)).toMatch(/第3音：.*歌词“天”/)
    expect(all(text)).toContain('和音，同时奏出')
  })
  it('reads rests and navigation and preserves measure numbers after a multi-rest', () => {
    const text = read('{2/4}\nN: {segno}{rest=3} | 1 2{fine} |\n---\nN: 3 4{ds} |||')
    expect(text.measures[0]!.voices[0]!.events[0]).toContain('连续休止3小节')
    expect(text.measures[1]!.label).toContain('第4小节')
    expect(text.measures[2]!.label).toContain('返回标记处重奏')
  })
  it('expands keyed visits with correct pitches and corresponding lyrics', () => {
    const text = read('{key=C}{2/4}{order=A,A@Db5}\n===A\nN: 1 2 |||\nL1: 春天\nL2: 秋天')
    expect(text.summary).toContain('换调再现按演奏顺序展开阅读')
    expect(text.measures).toHaveLength(2)
    expect(text.measures[1]!.voices[0]!.events[0]).toContain('升C5')
    expect(text.measures[1]!.voices[0]!.events[0]).toContain('歌词“秋”')
    expect(text.measures[1]!.voices[0]!.events[0]).not.toContain('歌词“春”')
  })
})
