import { describe, expect, it } from 'vitest'
import { BasicMIDI, MIDIMessage, MIDIMessageTypes } from 'spessasynth_core'
import { buildMetronomeBeats } from './metronome'

function midiWith(events: MIDIMessage[]) {
  const midi = new BasicMIDI()
  midi.timeDivision = 480
  midi.duration = 2
  midi.lastVoiceEventTick = 1920
  midi.tracks = [{ events } as BasicMIDI['tracks'][number]]
  midi.tempoChanges = [{ ticks: 0, tempo: 120 }]
  return midi
}

describe('metronome timeline', () => {
  it('accents each bar start using the MIDI time signature', () => {
    const beats = buildMetronomeBeats(midiWith([
      new MIDIMessage(0, MIDIMessageTypes.timeSignature, new Uint8Array([3, 2, 24, 8])),
    ]))

    expect(beats.slice(0, 4)).toEqual([
      { time: 0, accent: true },
      { time: 0.5, accent: false },
      { time: 1, accent: false },
      { time: 1.5, accent: true },
    ])
  })

  it('uses the MIDI tempo map for each following beat', () => {
    const midi = midiWith([])
    midi.tempoChanges = [{ ticks: 960, tempo: 60 }, { ticks: 0, tempo: 120 }]

    expect(buildMetronomeBeats(midi).map((beat) => beat.time)).toEqual([0, 0.5, 1, 2])
  })
})
