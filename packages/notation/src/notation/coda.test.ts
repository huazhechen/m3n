import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '../m3n-direct.js'
import { formatM3N } from '../m3n-format.js'
import { validateM3NDiagnostics } from '../m3n-validate.js'
import { compileScorePerformance } from '../performance.js'
import { measurePlaybackPasses, playbackMeasureIndexes } from './repeats.js'

const repeat = '{key=C}{2/4}\nN: ||: 1 2 | 3 4 {tocoda} |\nL1: Spring is here now\nL2: Fall is here now\n---\nN: 5 6 :||\nL: Go back\n---\nN: {coda}7 1e |||\nL: The end'
const pitches = (source: string) => compileScorePerformance(parseM3NDocument(source)).notes.map(note => note.pitch)

describe('To Coda navigation', () => {
  it('ignores To Coda the first time and jumps after the second visit, with actual lyric passes', () => {
    expect(validateM3NDiagnostics(repeat)).toEqual([])
    const document = parseM3NDocument(repeat), before = structuredClone(document)
    const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(playbackMeasureIndexes(bars)).toEqual([0,1,2,0,1,3])
    expect([...measurePlaybackPasses(bars).values()].map(passes => [...passes])).toEqual([[1,2],[1,2],[1],[1]])
    expect(pitches(repeat)).toEqual([60,62,64,65,67,69,60,62,64,65,71,72])
    expect(bars[1]!.navigation).toEqual(['tocoda'])
    expect(bars[3]!.navigation).toEqual(['coda'])
    expect(pitches(formatM3N(repeat))).toEqual(pitches(repeat))
    expect(document).toEqual(before)
  })

  it.each(['ds','dc'])('jumps only after %s returns, including a repeated passage on the initial traversal', jump => {
    const source = `{2/4}\nN: ||: ${jump === 'ds' ? '{segno}' : ''}1 2 | 3 4 {tocoda} :||\nL1: One two three four\nL2: One two three four\nL3: One two three four\n---\nN: 5 6 {${jump}} ||\n---\nN: {coda}7 1e |||`
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(pitches(source)).toEqual([60,62,64,65,60,62,64,65,67,69,60,62,64,65,71,72])
    expect(pitches(formatM3N(source))).toEqual(pitches(source))
  })

  it('waits for the final local repeat before arming a D.S. located at its end', () => {
    const source = '{2/4}\nN: ||: {segno}1 2 | 3 4{tocoda} |\n---\nN: 5 6{ds} :||\n---\nN: {coda}7 1e |||'
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(pitches(source)).toEqual([60,62,64,65,67,69,60,62,64,65,67,69,60,62,64,65,71,72])
  })

  it('takes an armed To Coda before a repeat at the same barline', () => {
    const source = '{2/4}\nN: ||: 1 2 {tocoda} :||{x3}\n---\nN: {coda}3 4 |||'
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(pitches(source)).toEqual([60,62,60,62,64,65])
  })

  it('retains repeats within the coda without playing the bypassed passage a second time', () => {
    const source = '{2/4}\nN: ||: 1 2 {tocoda} |\n---\nN: 3 4 :||\n---\nN: ||: {coda}5 6 :|||'
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(pitches(source)).toEqual([60,62,64,65,60,62,67,69,67,69])
  })

  it('takes the third verse ending via Coda, then repeats a shared chorus in the next key until Fine', () => {
    const source = `{key=C}{2/4}
N: ||: {segno}1 2 |
L1: First verse
L2: Next verse
L3: Third verse
---
N: 3 4 {tocoda} |
L1: First end
L2: Next end
L3: Third end
---V1
N: 3 4 :||
---V2
N: 5 6 |
---
N: ||: {key=C,Db}7 1e |
---V1
N: 2e 3e |
---V2
N: 4e 5e |
---
N: 6e 7e {fine}{ds} |||
---
N: {coda}{key=C}1e 2e | {key=Db}3e 4e :||`
    expect(validateM3NDiagnostics(source)).toEqual([])
    const bars = parseM3NDocument(source).parts.get('score')!.melody.filter(bar => bar.events.length)
    expect(playbackMeasureIndexes(bars)).toEqual([0,1,2,0,1,3,4,5,7,0,1,8,9,4,6,7])
    expect(pitches(source)).toEqual([60,62,64,65,64,65,60,62,64,65,67,69,71,72,74,76,81,83,60,62,64,65,72,74,77,78,72,73,78,80,82,84])
    expect(pitches(formatM3N(source))).toEqual(pitches(source))
  })

  it('preserves actual incoming keys, bass and the final 4+2 tie with keyed repeats', () => {
    const source = '{key=Eb}{4/4}\nN: 0 5d |\nB: 0^ |\n---\nN: ||: {key=Eb,F}1 2 3 4 {tocoda} |\nB: 1d^^ |\n---\nN: {key=F}5 6 7 1e :||\nB: 5d^^ |\n---\nN: {coda}1^^~ | 1^ |||\nB: 1d^^~ | 1d^ |'
    expect(validateM3NDiagnostics(source)).toEqual([])
    const performance = compileScorePerformance(parseM3NDocument(source))
    expect(performance.beats).toBe(20)
    expect(performance.notes.filter(note => note.channel === 0).at(-1)).toMatchObject({start:14,end:20,pitch:65})
    expect(performance.notes.filter(note => note.channel === 1).at(-1)).toMatchObject({start:14,end:20,pitch:53})
  })

  it('anchors a trailing exit to the preceding bar and a rest-only coda to its onset', () => {
    const source = '{2/4}\nN: ||: 1 2 | {tocoda}\n---\nN: 3 4 :||\n---\nN: {coda}{rest=2} | 5 6 |||'
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(pitches(source)).toEqual([60,62,64,65,60,62,67,69])
    expect(pitches(formatM3N(source))).toEqual(pitches(source))
  })

  it.each([
    ['{2/4}\nN: 1 2{tocoda} |||', '各有且仅有一个'],
    ['{2/4}\nN: {coda}1 2 |||', '各有且仅有一个'],
    ['{2/4}\nN: ||: 1 2{tocoda}{tocoda} | 3 4 :||\n---\nN: {coda}5 6 |||', '各有且仅有一个'],
    ['{2/4}\nN: {coda}1 2 | 3 4{tocoda} |||', '必须位于 To Coda 之后'],
    ['{2/4}\nN: 1 2{tocoda} | {coda}3 4 |||', '必须能在反复'],
    ['{2/4}\nN: ||: 1 2{tocoda} | 3 4 :||\n---\nN: 5 {coda}6 |||', '必须写在小节开头'],
    ['{2/4}{order=A,A}\n===A\nN: 1 2{tocoda} | {coda}3 4 |||', '不能与显式 order 混用'],
    ['{2/4}\nN: ||: 1 2 |\n---V1\nN: 3 4{tocoda} :||\n---V2\nN: {coda}5 6 |||', '房子之外'],
    ['{2/4}\nN: ||: 1 2{tocoda} | 3 4 :||\n---\nN: {coda}5 6 |||\nB: {coda}1d^ | 5d^ | 1d^ |', '低音谱表内不能使用反复导航标记'],
  ])('reports invalid coda routes: %s', (source,message) => {
    expect(validateM3NDiagnostics(source).some(item => item.message.includes(message))).toBe(true)
  })
})
