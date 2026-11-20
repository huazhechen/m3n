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
  it('prints visit-dependent section keys only at the entrance and real internal modulations', () => {
    const source = '{key=C}{2/4}{order=A,B,A,B@Db}\n===A\nN: 1 2 ||\n===B\nN: 3 4 | 5 6 | {key=G}1 2 | 3 4 |||'
    expect(keys(source)).toEqual([['1=C'], ['1=C'], [], ['1=G'], []])
  })

  it('uses the first visit as the displayed key even when that visit is transposed', () => {
    const source = '{key=C}{2/4}{order=A,B@F,A,B@G}\n===A\nN: 1 2 ||\n===B\nN: 3 4 | 5 6 |||'
    expect(keys(source)).toEqual([['1=C'], ['1=F'], []])
  })

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
    // Keep the original local-house regression after the song's repeat was expanded.
    const source = '{key=Bb}{4/4}\nN: ||: (5d. (5~)) 5. (3) (4 5) | 5. (4) 5#^ |\n---V1\nN: {key=Db}(5. (4e~)) 4e. (2e) (3e 4e) :||\n---V2\nN: {key=Db}(5. (4e~)) 4e. (6e~) ((6e) 5e (3e)) |||'
    const controls = keys(source)
    expect(controls[2]).toContain('1=Db')
    expect(controls[3]).toContain('1=Db')
  })
})
