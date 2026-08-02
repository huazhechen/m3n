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

  it('does not leak part-local settings into the next named part', () => {
    const document = parseM3NDocument([
      '{key=C} {2/4} {120qpm} {parts=A B}',
      '{part=A}{key=D} {3/4} {90qpm}1 2 3 |{/}',
      '{part=B}1 2 |{/}',
    ].join('\n'))
    const first = document.parts.get('A')?.melody[0]?.events[0]
    const second = document.parts.get('B')?.melody[0]?.events[0]

    expect(first).toMatchObject({ key: 'D', meterCount: 3, meterUnit: 4, tempo: 90 })
    expect(second).toMatchObject({ key: 'C', meterCount: 2, meterUnit: 4, tempo: 120 })
  })

  it('inherits melody setting changes in the bass staff', () => {
    const document = parseM3NDocument([
      '{key=C} {2/4} {120qpm} 1 2 | {key=D} {3/4} {90qpm}1 2 3 |||',
      '{bass}1d 2d | 1d 2d 3d |||{/}',
    ].join('\n'))
    const bass = document.parts.get('score')?.bass
    const first = bass?.[0]?.events[0]
    const second = bass?.[1]?.events[0]

    expect(first).toMatchObject({ key: 'C', meterCount: 2, meterUnit: 4, tempo: 120 })
    expect(second).toMatchObject({ key: 'D', meterCount: 3, meterUnit: 4, tempo: 90 })
  })

  it('keeps a tempo-ramp target after its interval and shares it with bass', () => {
    const document = parseM3NDocument([
      '{2/4} {120qpm} {rit=80}1 2{/} | 3 4 |||',
      '{bass}1d 2d | 3d 4d |||{/}',
    ].join('\n'))
    const melody = document.parts.get('score')?.melody[1]?.events[0]
    const bass = document.parts.get('score')?.bass[1]?.events[0]

    expect(melody).toMatchObject({ tempo: 80 })
    expect(bass).toMatchObject({ tempo: 80 })
  })

  it('assigns every public measure to all passes required by a later multi-pass ending', () => {
    const measures = parseM3NDocument('{2/4} ||: 1 2 | {volta=1}3 4{/} | {volta=2~4}5 6{/} | 7 1e :||{x3} |||').parts.get('score')!.melody
    const passes = measurePlaybackPasses(measures)

    expect(passes.get(measures[0])).toEqual(new Set([1, 2, 3, 4]))
    expect(passes.get(measures[1])).toEqual(new Set([1]))
    expect(passes.get(measures[2])).toEqual(new Set([2, 3, 4]))
    expect(passes.get(measures[3])).toEqual(new Set([1, 2, 3, 4]))
  })

  it('keeps the initial second pass before a D.S. from a second ending', () => {
    const measures = parseM3NDocument('{2/4} ||: 1 2 | {volta=1}3 4{/}:|| {volta=2}5 6{ds}{/} || {segno}7 1 |||').parts.get('score')!.melody
    const passes = measurePlaybackPasses(measures)

    expect(passes.get(measures[0])).toEqual(new Set([1, 2]))
  })
})
