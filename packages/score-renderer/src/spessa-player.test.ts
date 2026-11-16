import { describe, expect, it } from 'vitest' 
import { BasicMIDI, MIDIBuilder } from 'spessasynth_core'
import { playbackRateAtBpm, seekTimeAtProgress, transposeMidiData } from './spessa-player'

describe('score MIDI playback', () => {
  it('converts absolute BPM to playback rate without the old percentage limits', () => {
    expect(playbackRateAtBpm(60, 120)).toBe(0.5)
    expect(playbackRateAtBpm(80, 160)).toBe(0.5)
    expect(playbackRateAtBpm(10, 120)).toBeCloseTo(1 / 12)
    expect(playbackRateAtBpm(240, 60)).toBe(4)
    expect(playbackRateAtBpm(1, 120)).toBeCloseTo(1 / 12)
    expect(playbackRateAtBpm(300, 120)).toBe(2)
    expect(() => playbackRateAtBpm(NaN, 120)).toThrow()
  })
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
