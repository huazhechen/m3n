import { describe, expect, it } from 'vitest' 
import { BasicMIDI, MIDIBuilder } from 'spessasynth_core'
import { seekTimeAtProgress, transposeMidiData } from './spessa-player'

describe('score MIDI playback', () => {
  it('keeps seeks just before the end of a sequence', () => {
    expect(seekTimeAtProgress(12, 1)).toBeCloseTo(11.999)
    expect(seekTimeAtProgress(12, 2)).toBeCloseTo(11.999)
    expect(seekTimeAtProgress(12, -1)).toBe(0)
  })

  it('transposes melodic MIDI notes within the supported range', () => {
    const builder = new MIDIBuilder()
    builder.noteOn(0, 0, 0, 60, 100)
    builder.noteOff(480, 0, 0, 60)
    const shifted = BasicMIDI.fromArrayBuffer(transposeMidiData(builder.writeMIDI(), 5))
    const noteOn = shifted.tracks.flatMap((track) => track.events)
      .find((event) => (event.statusByte & 0xf0) === 0x90 && event.data[1] > 0)
    expect(noteOn?.data[0]).toBe(65)
  })
})
