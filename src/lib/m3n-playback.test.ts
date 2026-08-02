import { describe, expect, it } from 'vitest'
import { buildAccompaniment, buildAccompanimentFromDocument, buildTempoChanges, buildTempoChangesFromDocument } from './m3n-playback'
import { parseM3NDocument } from './m3n-direct'

describe('M3N accompaniment playback', () => {
  it('derives playback data from an already parsed document', () => {
    const source = '{key=C} {4/4} {120qpm}\n{chord=I}1 2 {rit=80}3 4{/} |||'
    const document = parseM3NDocument(source)

    expect(buildAccompanimentFromDocument(document)).toEqual(buildAccompaniment(source))
    expect(buildTempoChangesFromDocument(document)).toEqual(buildTempoChanges(source))
  })

  it('creates a MIDI-only block-chord plan without changing notation layers', () => {
    const notes = buildAccompaniment('{key=C} {5/4}\n{chord=I}1 2 3 4 5 |||')

    expect(notes).toEqual([
      { startBeats: 0, durationBeats: 1, midi: 48, velocity: 52 },
      { startBeats: 0, durationBeats: 1, midi: 52, velocity: 52 },
      { startBeats: 0, durationBeats: 1, midi: 55, velocity: 52 },
      { startBeats: 1, durationBeats: 1, midi: 48, velocity: 52 },
      { startBeats: 1, durationBeats: 1, midi: 52, velocity: 52 },
      { startBeats: 1, durationBeats: 1, midi: 55, velocity: 52 },
      { startBeats: 2, durationBeats: 1, midi: 48, velocity: 52 },
      { startBeats: 2, durationBeats: 1, midi: 52, velocity: 52 },
      { startBeats: 2, durationBeats: 1, midi: 55, velocity: 52 },
      { startBeats: 3, durationBeats: 1, midi: 48, velocity: 52 },
      { startBeats: 3, durationBeats: 1, midi: 52, velocity: 52 },
      { startBeats: 3, durationBeats: 1, midi: 55, velocity: 52 },
      { startBeats: 4, durationBeats: 1, midi: 48, velocity: 52 },
      { startBeats: 4, durationBeats: 1, midi: 52, velocity: 52 },
      { startBeats: 4, durationBeats: 1, midi: 55, velocity: 52 },
    ])
  })

  it('leaves trills to Verovio rather than adding accompaniment notes', () => {
    expect(buildAccompaniment('{key=C} {4/4}\n1{tr} 2 3 4 |||')).toEqual([])
  })

  it('arpeggiates accompaniment in common meters', () => {
    expect(buildAccompaniment('{key=C} {3/4}\n{chord=I}1. 2. |||')).toMatchObject([
      { startBeats: 0, durationBeats: 1, midi: 48 },
      { startBeats: 1, durationBeats: 0.5, midi: 52 },
      { startBeats: 1.5, durationBeats: 1, midi: 55 },
      { startBeats: 2.5, durationBeats: 0.5, midi: 48 },
    ])
  })

  it('creates matching tempo points for a ritardando interval', () => {
    expect(buildTempoChanges('{4/4} {120qpm}\n{rit=80}1 2 3 4{/} | 1 2 3 4 |||')).toEqual([
      { startBeats: 1, tempo: 107, sourceStart: 25, ramp: true },
      { startBeats: 2, tempo: 93, sourceStart: 27, ramp: true },
      { startBeats: 3, tempo: 80, sourceStart: 29, ramp: true },
    ])
  })

  it('keeps the target tempo after a gradual change closes', () => {
    expect(buildTempoChanges('{2/4} {120qpm}\n{rit=80}1 2{/} | 3 4 |||')).toEqual([
      { startBeats: 1, tempo: 80, sourceStart: 25, ramp: true },
    ])
  })
})
