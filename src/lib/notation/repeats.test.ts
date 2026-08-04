import { describe, expect, it } from 'vitest'
import { buildPlaybackSequence, measurePlaybackPasses, parsePassRange, type PlaybackNode } from './repeats'

const nodes = (...items: Omit<PlaybackNode, 'id'>[]) => items.map((item, index) => ({ id: `n${index + 1}`, ...item }))

describe('repeat planning', () => {
  it('parses individual and ranged playback passes', () => {
    expect(parsePassRange('1,3~5,7')).toEqual(new Set([1, 3, 4, 5, 7]))
  })

  it('resets earlier ending groups after a later implicit repeat', () => {
    const sequence = buildPlaybackSequence(nodes(
      { kind: 'section' },
      { kind: 'ending', n: '1', repeatCount: 2 },
      { kind: 'ending', n: '2' },
      { kind: 'section' },
      { kind: 'ending', n: '1', repeatCount: 2 },
      { kind: 'ending', n: '2' },
    ))

    expect(sequence).toEqual(['n1', 'n2', 'n1', 'n3', 'n4', 'n5', 'n1', 'n2', 'n1', 'n3', 'n4', 'n6'])
  })

  it('does not let a closed explicit repeat capture a later implicit repeat', () => {
    const sequence = buildPlaybackSequence(nodes(
      { kind: 'section', repeatStart: true, repeatCount: 3 },
      { kind: 'section', repeatCount: 2 },
    ))

    expect(sequence).toEqual(['n1', 'n1', 'n1', 'n2', 'n2'])
  })

  it('counts earlier music across consecutive implicit repeats', () => {
    const measures = [
      { events: [], right: 'rptend' as const },
      { events: [], right: 'rptend' as const },
    ]
    const passes = measurePlaybackPasses(measures)

    expect(passes.get(measures[0])).toEqual(new Set([1, 2, 3, 4]))
    expect(passes.get(measures[1])).toEqual(new Set([1, 2]))
  })

  it('counts a D.S. return as another pass', () => {
    const measures = [
      { events: [{ navigation: ['segno' as const] }] },
      { events: [] },
      { events: [{ navigation: ['fine' as const] }] },
      { events: [{ navigation: ['ds' as const] }] },
    ]
    const passes = measurePlaybackPasses(measures)

    expect(passes.get(measures[0])).toEqual(new Set([1, 2]))
    expect(passes.get(measures[1])).toEqual(new Set([1, 2]))
    expect(passes.get(measures[2])).toEqual(new Set([1, 2]))
    expect(passes.get(measures[3])).toEqual(new Set([1]))
  })

  it('plays written endings in sequence when none closes a repeat', () => {
    const sequence = buildPlaybackSequence(nodes(
      { kind: 'section' },
      { kind: 'ending', n: '1' },
      { kind: 'ending', n: '2' },
    ))

    expect(sequence).toEqual(['n1', 'n2', 'n3'])
  })

})
