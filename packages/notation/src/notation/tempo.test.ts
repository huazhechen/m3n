import { describe, expect, it } from 'vitest'
import { displayedTempo } from './tempo.js'

describe('displayed metronome tempo', () => {
  it('uses quarter notes in simple quarter meters and the denominator note otherwise', () => {
    expect(displayedTempo(120, 4, 4)).toEqual({ unit: 4, dots: 0, bpm: 120 })
    expect(displayedTempo(120, 2, 2)).toEqual({ unit: 2, dots: 0, bpm: 60 })
    expect(displayedTempo(120, 5, 8)).toEqual({ unit: 8, dots: 0, bpm: 240 })
  })

  it('uses dotted-quarter beats for compound eighth-note meters', () => {
    expect(displayedTempo(120, 6, 8)).toEqual({ unit: 4, dots: 1, bpm: 80 })
    expect(displayedTempo(100, 9, 8)).toEqual({ unit: 4, dots: 1, bpm: 66.67 })
  })
})
