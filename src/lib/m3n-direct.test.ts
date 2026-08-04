import { describe, expect, it } from 'vitest'
import { measurePlaybackPasses, parseM3NDocument } from './m3n-direct'

describe('direct M3N parser', () => {
  it('uses the specified default tempo when no tempo directive is present', () => {
    const event = parseM3NDocument('{4/4} 1 2 3 4 |||').parts.get('score')?.melody[0]?.events[0]

    expect(event).toMatchObject({ tempo: 120 })
  })

  it('retains the source information field', () => {
    expect(parseM3NDocument('{source=First edition} {4/4} 1 2 3 4 |||').source).toBe('First edition')
  })

  it('keeps lyrics scoped to their display section phrases', () => {
    const document = parseM3NDocument([
      '{2/4}',
      '===A',
      'N: 1 2 |',
      'L: 甲乙',
      '===C',
      'N: 3 4 |||',
      'L: 啦啦',
    ].join('\n'))

    expect(document.lyrics).toMatchObject([
      { range: '', syllables: [{ text: '甲' }, { text: '乙' }] },
      { range: '', syllables: [{ text: '啦' }, { text: '啦' }] },
    ])
  })

  it('keeps each lyric block scoped to its phrase', () => {
    const source = '{2/4}\nN: 1 2 |\nL: 甲乙\n---\nN: 3 4 |||\nL: 丙丁'
    const document = parseM3NDocument(source)

    expect(document.lyrics).toMatchObject([
      { range: '', targetStart: source.indexOf('1 2'), targetEnd: source.indexOf('1 2') + 5 },
      { range: '', targetStart: source.indexOf('3 4'), targetEnd: source.indexOf('3 4') + 7 },
    ])
  })

  it('does not render a lyric reference as an extra verse', () => {
    const source = '{2/4}\nN: 1 2 :|||{x3}\nL1: 甲乙\nL2: 丙丁\nL3: {L2}'
    const document = parseM3NDocument(source)

    expect(document.lyrics.map((block) => block.range)).toEqual(['1', '2'])
    expect(document.lyrics[1]?.syllables).toMatchObject([{ text: '丙' }, { text: '丁' }])
  })

  it('inherits melody setting changes in the bass staff', () => {
    const document = parseM3NDocument([
      '{key=C} {2/4} {120qpm}',
      'N: 1 2 | {key=D} {3/4} {90qpm}1 2 3 |||',
      'B: 1d 2d | 1d 2d 3d |||',
    ].join('\n'))
    const bass = document.parts.get('score')?.bass
    const first = bass?.[0]?.events[0]
    const second = bass?.[1]?.events[0]

    expect(first).toMatchObject({ key: 'C', meterCount: 2, meterUnit: 4, tempo: 120 })
    expect(second).toMatchObject({ key: 'D', meterCount: 3, meterUnit: 4, tempo: 90 })
  })

  it('keeps a tempo-ramp target after its interval and shares it with bass', () => {
    const document = parseM3NDocument([
      '{2/4} {120qpm}',
      'N: {rit=80}1 2{/} | 3 4 |||',
      'B: 1d 2d | 3d 4d |||',
    ].join('\n'))
    const melody = document.parts.get('score')?.melody[1]?.events[0]
    const bass = document.parts.get('score')?.bass[1]?.events[0]

    expect(melody).toMatchObject({ tempo: 80 })
    expect(bass).toMatchObject({ tempo: 80 })
  })

  it('assigns every public measure to all passes required by a later multi-pass ending', () => {
    const measures = parseM3NDocument('{2/4}\nN: ||: 1 2 |\n---V1\nN: 3 4 |\n---V2,V3,V4\nN: 5 6 |\n---\nN: 7 1e :||{x3} |||').parts.get('score')!.melody
    const passes = measurePlaybackPasses(measures)

    expect(passes.get(measures[0])).toEqual(new Set([1, 2, 3, 4]))
    expect(passes.get(measures[1])).toEqual(new Set([1]))
    expect(passes.get(measures[2])).toEqual(new Set([2, 3, 4]))
    expect(passes.get(measures[3])).toEqual(new Set([1, 2, 3, 4]))
  })

  it('keeps a tie on the final pitched tuplet child', () => {
    const event = parseM3NDocument('{key=C} {4/4} [123~:2] 3 0 |||').parts.get('score')?.melody[0]?.events[0]

    expect(event).toMatchObject({ kind: 'tuplet', pitches: ['1', '2', '3'], tie: true, tieFromTupletIndex: 2 })
  })
})
