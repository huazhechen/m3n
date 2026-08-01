import { BasicMIDI, MIDIBuilder } from 'spessasynth_core'
import { describe, expect, it } from 'vitest'
import { prepareScoreMidi, seekTimeAtProgress, sourceTimeAt } from './spessa-player'

describe('score MIDI playback preparation', () => {
  it('writes gradual tempo changes as MIDI tempo events', () => {
    const midi = new MIDIBuilder({ format: 1, initialTempo: 120, timeDivision: 480, name: 'test' })
    midi.addTrack('score')
    midi.noteOn(0, 1, 0, 60, 80)
    midi.noteOff(1920, 1, 0, 60)

    const result = BasicMIDI.fromArrayBuffer(prepareScoreMidi(midi.writeMIDI(), [
      { startBeats: 1, tempo: 107, ramp: true },
      { startBeats: 2, tempo: 93, ramp: true },
      { startBeats: 3, tempo: 80, ramp: true },
    ]))

    const tempoAt = (ticks: number) => result.tempoChanges.find((change) => change.ticks === ticks)?.tempo
    expect(tempoAt(480)).toBeCloseTo(107)
    expect(tempoAt(960)).toBeCloseTo(93)
    expect(tempoAt(1440)).toBeCloseTo(80)
  })

  it('maps changed playback time back to the source score timeline', () => {
    const midi = new MIDIBuilder({ format: 1, initialTempo: 120, name: 'test' })
    midi.addTrack('score')
    midi.noteOn(0, 1, 0, 60, 80)
    midi.noteOff(1920, 1, 0, 60)
    const source = midi.writeMIDI()
    const playback = BasicMIDI.fromArrayBuffer(prepareScoreMidi(source, [{ startBeats: 1, tempo: 60, ramp: true }]))

    expect(sourceTimeAt(playback, BasicMIDI.fromArrayBuffer(source), 1)).toBeCloseTo(0.75)
  })

  it('keeps seeks just before the end of a sequence', () => {
    expect(seekTimeAtProgress(12, 1)).toBeCloseTo(11.999)
    expect(seekTimeAtProgress(12, 2)).toBeCloseTo(11.999)
    expect(seekTimeAtProgress(12, -1)).toBe(0)
  })
})
