import { deriveScoreInteraction, parseM3NDocument, resolveScorePitches } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import badinerie from '../scores/badinerie_bwv1067_01.m3n?raw'
import sudden from '../scores/tu_ran_hao_xiang_ni_01.m3n?raw'
import reference from './fixtures/badinerie-dual-source.json'

const document = parseM3NDocument(badinerie)
const bars = document.parts.get('score')!.melody.filter(bar => bar.events.length)
const pitches = resolveScorePitches(bars)

function slursInCell(cell: number) {
  const events = bars[cell - 1]!.events
  return document.intervals.filter(interval => interval.kind === 'lg'
    && interval.start! >= events[0]!.sourceStart && interval.end! <= events.at(-1)!.sourceEnd)
    .map(interval => events.filter(event => event.sourceStart >= interval.start! && event.sourceEnd <= interval.end!))
}

describe('Badinerie independent uploaded-arrangement cross-check', () => {
  it('matches all 80 manually read quarter-beat anchors in the uploaded arrangement', () => {
    const semitones: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
    const accidentals: Record<string, number> = { '': 0, n: 0, s: 1, f: -1, ss: 2, ff: -2 }
    const actual = bars.map(bar => {
      let beat = 0
      const events = bar.events.map(event => { const start = beat; beat += event.beats; return { event, start, end: beat } })
      return Array.from({ length: beat }, (_, boundary) => {
        const event = events.find(event => event.start <= boundary && boundary < event.end)!.event
        const [name, octave, accidental] = pitches.get(event)![0]!.split(':')
        return 12 * (Number(octave) + 1) + semitones[name!]! + accidentals[accidental!]!
      })
    })
    expect(actual.flat()).toHaveLength(80)
    expect(actual).toEqual(reference.quarterBeatMidiByCell)
  })

  it.each([35, 36])('retains both the sustain tie and the separate four-note descent slur in cell %i', cell => {
    const events = bars[cell - 1]!.events
    expect(events.some(event => event.tie)).toBe(true)
    expect(slursInCell(cell)).toEqual([events.slice(-4)])
  })

  it.each([21, 39])('ends the two-note slur before the next articulated note in cell %i', cell => {
    expect(slursInCell(cell)).toEqual([bars[cell - 1]!.events.slice(0, 2)])
  })

  it('retains the solo edition staccatos on the lower-register answers and final upper-register return', () => {
    for (const [cell, indices] of [[19, [0, 3]], [22, [2]], [23, [0, 3]], [34, [2]], [38, [0, 1]], [41, [0, 1]]] as const) {
      for (const index of indices) expect(bars[cell - 1]!.events[index]!.postfixes).toContain('tip')
    }
  })

  it('uses the unslashed C-sharp appoggiatura and fermata shown in both final cadences', () => {
    expect(bars.at(-1)!.events[0]!.postfixes).toEqual(['ap(7)', 'fermata'])
  })
})

it('sings “纪念品”的“纪” on high 3 with its original half-beat duration', () => {
  const document = parseM3NDocument(sudden)
  const lyrics = deriveScoreInteraction(document).lyricsByEvent
  const event = document.parts.get('score')!.melody.flatMap(bar => bar.events)
    .find(event => lyrics.get(event)?.some(lyric => lyric.text === '纪'))!
  expect(event.pitches).toEqual(['3e'])
  expect(event.beats).toBe(.5)
})
