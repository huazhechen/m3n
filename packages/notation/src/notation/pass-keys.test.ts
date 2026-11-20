import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '../m3n-direct.js'
import { formatM3N } from '../m3n-format.js'
import { validateM3NDiagnostics } from '../m3n-validate.js'
import { compileScorePerformance } from '../performance.js'
import { incomingMeasureKeys } from './key-connections.js'
import { unfoldScorePerformance } from './performance-order.js'

const pitches = (source: string) => compileScorePerformance(parseM3NDocument(source)).notes.map(note => note.pitch)

describe('numbered keys in ordinary repeats', () => {
  it('uses the pass key for melody, chords, grace notes and inherited bass, then resets at a plain key', () => {
    const source = '{key=Eb}{2/4}\nN: ||: {key=Eb,F}[1 3 5:h] 2{ac(1)} | 3 4 :||\n---\nN: {key=G}1 2 |||\nB: 1d^ | 5d^ | 1d^ |'
    expect(validateM3NDiagnostics(source)).toEqual([])
    const document = parseM3NDocument(source), before = structuredClone(document)
    const performance = compileScorePerformance(document)
    expect(performance.notes.filter(note => note.channel === 0).map(note => note.pitch)).toEqual([63,67,70,63,65,67,68,65,69,72,65,67,69,70,67,69])
    expect(performance.notes.filter(note => note.channel === 1).map(note => note.pitch)).toEqual([51,58,53,60,55])
    expect(pitches(formatM3N(source))).toEqual(pitches(source))
    expect(document).toEqual(before)
    const bars = document.parts.get('score')!.melody
    expect([...incomingMeasureKeys(document,bars).get(bars[0]!)!]).toEqual(['Eb'])
    expect(unfoldScorePerformance(document).parts.get('score')!.melody.flatMap(bar => bar.events).every(event => !event.keyPasses)).toBe(true)
  })

  it('starts a repeat at a local first house after a pickup and selects the second-house key', () => {
    const source = '{key=Eb}{2/4}\nN: 0 5d |\n---V1\nN: ||: {key=Eb,F}1 2 |\n---V2\nN: 3 4 |\n---\nN: 5 6 |\n---V1\nN: {key=E}1 2 :||\n---V2\nN: {key=F}1 0 |||'
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(pitches(source)).toEqual([58,63,65,70,72,64,66,69,70,72,74,65])
    const document = parseM3NDocument(source), bars = document.parts.get('score')!.melody
    expect([...incomingMeasureKeys(document,bars).get(bars[3]!)!]).toEqual(['Eb','F'])
  })

  it('supports header key lists and multi-rests, and stops inheriting the list after an ordinary key', () => {
    const source = '{key=C,D}{2/4}\nN: ||: {rest=2} | 1 2 :||\n---\nN: {key=G}1 2 |||'
    expect(validateM3NDiagnostics(source)).toEqual([])
    expect(pitches(source)).toEqual([60,62,62,64,67,69])
    expect(parseM3NDocument(source).key).toBe('C')
  })

  it.each([
    ['{2/4}\nN: ||: {key=Eb,F,}1 2 :|||', '调号格式非法'],
    ['{2/4}\nN: ||: 1 {key=Eb,F}2 :|||', '分遍调号必须写在小节开头'],
    ['{2/4}\nN: ||: {key=Eb,F}1 2 :|||{x3}', '缺少第 3 遍'],
    ['{2/4}{order=A,A}\n===A\nN: {key=Eb,F}1 2 |||', '不能与显式 order 混用'],
  ])('rejects unusable pass keys: %s', (source, message) => {
    expect(validateM3NDiagnostics(source).some(item => item.message.includes(message))).toBe(true)
  })
})
