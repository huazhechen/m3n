import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compileScorePerformance, parseM3NDocument, validateM3NDiagnostics } from '@m3n/notation'
import { projectNativeScore } from './native-model.js'
import { DefaultTextMeasurer } from './native-measure.js'

function keys(source: string) {
  expect(validateM3NDiagnostics(source)).toEqual([])
  const document = parseM3NDocument(source)
  const before = compileScorePerformance(document)
  const projection = projectNativeScore(document, { textMeasurer: new DefaultTextMeasurer() })
  expect(compileScorePerformance(document)).toEqual(before)
  return projection.measures.map(measure => projection.glyphs.filter(g => g.measureId === measure.id).flatMap(g => g.controls.filter(c => c.kind === 'key').map(c => c.text)))
}

describe('key signatures at playback connections', () => {
  it('marks each house entered from the common key, regardless of the preceding printed house', () => {
    expect(keys('{key=C}{2/4}\nN: ||: 1 2 |\n---V1\nN: {key=G}3 4 :||\n---V2\nN: {key=G}5 6 |||')).toEqual([['1=C'], ['1=G'], ['1=G']])
  })
  it('omits a house key already carried by its actual predecessor', () => {
    expect(keys('{key=C}{2/4}\nN: ||: 1 2 |\n---V1\nN: {key=G}3 4 :||\n---V2\nN: {key=C}5 6 |||')).toEqual([['1=C'], ['1=G'], []])
  })
  it('marks a common tail when any selected house reaches it in another key', () => {
    expect(keys('{key=C}{2/4}\nN: ||: 1 2 |\n---V1\nN: {key=G}3 4 |\n---V2\nN: {key=C}5 6 |\n---\nN: 1 2 :|||')).toEqual([[], ['1=G'], [], ['1=C']])
  })
  it('keeps ordinary internal changes and omits unchanged measure entries', () => {
    expect(keys('{key=C}{2/4}\nN: 1 {key=G}2 | 3 4 |||')).toEqual([['1=G'], []])
  })
  it('uses visit order for houses selected by named-section visits', () => {
    expect(keys('{key=C}{2/4}{order=A,A}\n===A\nN: 1 2 |\n---V1\nN: {key=G}3 4 ||\n---V2\nN: {key=G}5 6 |||')).toEqual([['1=C'], ['1=G'], ['1=G']])
  })
  it('restores the key at a D.S. return', () => {
    expect(keys('{key=C}{2/4}\nN: {segno}1 2{fine} |\n---\nN: {key=G}3 4{ds} |||')).toEqual([['1=C'], ['1=G']])
  })
  it('carries key changes through multi-measure rests', () => {
    expect(keys('{key=C}{2/4}\nN: ||: 1 2 |\n---V1\nN: {key=G}{rest=2} :||\n---V2\nN: {key=G}5 6 |||')).toEqual([['1=C'], ['1=G'], ['1=G']])
  })
  it('prints the Db key on both Black Humor alternate endings', () => {
    const source = readFileSync(new URL('../../../src/scores/hei_se_you_mo_01.m3n', import.meta.url), 'utf8')
    const controls = keys(source)
    expect(controls[25]).toContain('1=Db')
    expect(controls[26]).toContain('1=Db')
  })
})
