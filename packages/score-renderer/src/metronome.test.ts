import { BasicMIDI, MIDIMessage, MIDIMessageTypes } from 'spessasynth_core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Metronome, buildMetronomeBeats } from './metronome'

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

// These tests observe scheduled Web Audio times rather than a second timer clock.
describe('metronome audio scheduling', () => {
  const setup = () => {
    const oscillators: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = []
    const parameter = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() })
    const context = {
      currentTime: 10, destination: {},
      createOscillator: () => {
        const oscillator = { frequency: parameter(), start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), addEventListener: vi.fn() }
        oscillators.push(oscillator); return oscillator
      },
      createGain: () => ({ gain: parameter(), connect: vi.fn(), disconnect: vi.fn() }),
    }
    return { context, oscillators }
  }
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis) })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('reads the sequencer audio clock on every scheduling pass', () => {
    const { context, oscillators } = setup()
    let time = 0
    const metronome = new Metronome(context as unknown as AudioContext, [0, 0.5, 1].map(time => ({ time, accent: false })))
    metronome.start(0, 1, false, () => ({ time, rate: 1 }))
    expect(oscillators[0]!.start).toHaveBeenCalledWith(10)
    context.currentTime = 10.35; time = 0.35; vi.advanceTimersByTime(25)
    expect(oscillators[1]!.start).toHaveBeenCalledWith(10.5)
    context.currentTime = 10.8; time = 0.85; vi.advanceTimersByTime(25)
    expect(oscillators[2]!.start.mock.calls[0]![0]).toBeCloseTo(10.95, 9)
    metronome.stop()
    expect(oscillators.every(oscillator => oscillator.stop.mock.calls.length === 2)).toBe(true)
  })
  it('starts at the next beat after a non-beat seek and applies the actual rate', () => {
    const { context, oscillators } = setup()
    const metronome = new Metronome(context as unknown as AudioContext, [{ time: 5, accent: true }, { time: 5.5, accent: false }])
    metronome.start(5.2, 2, false, () => ({ time: 5.2, rate: 2 }))
    expect(oscillators).toHaveLength(1)
    expect(oscillators[0]!.start).toHaveBeenCalledWith(10.15)
    metronome.stop()
  })
  it('does not replay a beat that has just passed when enabled mid-playback', () => {
    const { context, oscillators } = setup()
    const metronome = new Metronome(context as unknown as AudioContext, [
      { time: 5, accent: true }, { time: 5.5, accent: false },
    ])
    let playbackTime = 5.002
    metronome.start(playbackTime, 2, false, () => ({ time: playbackTime, rate: 2 }))
    context.currentTime = 10.1
    playbackTime = 5.202
    vi.advanceTimersByTime(25)
    expect(oscillators).toHaveLength(1)
    expect(oscillators[0]!.start.mock.calls[0]![0]).toBeCloseTo(10.249, 9)
    metronome.stop()
  })
  it('does not let the count-in timer schedule song beats before MIDI actually starts', () => {
    const { context, oscillators } = setup(); context.currentTime = 0
    const metronome = new Metronome(context as unknown as AudioContext, [{ time: 0, accent: true }], 2, 0.5)
    metronome.start(0, 1, true)
    context.currentTime = 0.4; vi.advanceTimersByTime(25)
    context.currentTime = 0.9; vi.advanceTimersByTime(25)
    expect(oscillators.map(oscillator => oscillator.start.mock.calls[0]![0])).toEqual([0, 0.5])
    context.currentTime = 1.2
    metronome.start(0, 1, false, () => ({ time: 0, rate: 1 }))
    expect(oscillators[2]!.start).toHaveBeenCalledWith(1.2)
    metronome.stop()
  })
})
