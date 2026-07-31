import { describe, expect, it } from 'vitest'
import { buildAccompaniment, buildTempoChanges } from './m3n-playback'

describe('M3N accompaniment playback', () => {
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

  it('adds audible trill notes to the playback track', () => {
    const notes = buildAccompaniment('{key=C} {4/4}\n1{tr} 2 3 4 |||')

    expect(notes).toContainEqual({ startBeats: 0.25, durationBeats: 0.25, midi: 62, velocity: 62 })
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
