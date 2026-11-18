import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIDIBuilder } from 'spessasynth_core'
import { SpessaPlayer } from './spessa-player.js'

vi.mock('./startup-cue.js', () => ({ StartupCue: class {
  active = false
  play = async () => {}
  cancel = () => {}
  setTempo = () => {}
} }))

const instances = vi.hoisted(() => ({ sequences: [] as any[], metronomes: [] as any[] }))
vi.mock('./synthetic-soundfont.js', () => ({ createSyntheticSoundFont: () => new ArrayBuffer(0) }))
vi.mock('spessasynth_lib', () => ({
  WorkletSynthesizer: class {
    isReady = Promise.resolve()
    soundBankManager = { addSoundBank: async () => {} }
    connect = vi.fn()
    setSystemParameter = vi.fn()
    destroy = vi.fn()
  },
  Sequencer: class {
    time = 0
    visualTime = 9
    duration = 120
    paused = true
    playbackRate = 1
    pending: number[] = []
    callbacks = new Map<string, Map<string, (data: any) => void>>()
    eventHandler = {
      addEvent: (name: string, id: string, callback: (data: any) => void) => {
        if (!this.callbacks.has(name)) this.callbacks.set(name, new Map())
        this.callbacks.get(name)!.set(id, callback)
      },
      removeEvent: (name: string, id: string) => { this.callbacks.get(name)?.delete(id) },
    }
    constructor() { instances.sequences.push(this) }
    get currentTime() { return this.time }
    // Deliberately asynchronous: the old implementation restarted clicks
    // while this getter still returned the pre-seek time.
    set currentTime(time: number) { this.pending.push(time) }
    get currentHighResolutionTime() { return this.visualTime }
    loadNewSongList() { void Promise.resolve().then(() => this.acknowledge(0)) }
    acknowledge(time: number) {
      this.time = time; this.visualTime = time + 9
      this.emit('timeChange', time)
    }
    emit(name: string, data: any = null) { for (const callback of this.callbacks.get(name)?.values() ?? []) callback(data) }
    play = vi.fn(() => { this.paused = false })
    pause = vi.fn(() => { this.paused = true })
  },
}))
vi.mock('./metronome.js', () => ({
  buildMetronomeBeats: () => [], initialBeatDurationSeconds: () => 0.5,
  Metronome: class {
    countInDurationSeconds: number
    constructor(_context: unknown, _beats: unknown, count: number) {
      this.countInDurationSeconds = count * 0.5; instances.metronomes.push(this)
    }
    start = vi.fn()
    stop = vi.fn()
  },
}))

const create = async () => {
  const midi = new MIDIBuilder(); midi.noteOn(0, 0, 0, 60, 90); midi.noteOff(480, 0, 0, 60)
  const listener = { onTime: vi.fn(), onEnded: vi.fn() }
  const player = await SpessaPlayer.create(midi.writeMIDI(), listener, 0)
  const sequence = instances.sequences.at(-1)!, metronome = instances.metronomes.at(-1)!
  player.setMetronomeEnabled(true)
  return { player, sequence, metronome, listener }
}

beforeEach(() => {
  vi.useFakeTimers()
  instances.sequences.length = instances.metronomes.length = 0
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('AudioContext', class {
    audioWorklet = { addModule: async () => {} }
    resume = async () => {}
    close = async () => {}
  })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('audio-thread-confirmed transport and metronome synchronization', () => {
  it('silences old clicks immediately and waits for the new audio position', async () => {
    const { player, sequence, metronome, listener } = await create()
    await player.play()
    expect(metronome.start).toHaveBeenLastCalledWith(0, 1, false, expect.any(Function))
    const starts = metronome.start.mock.calls.length
    sequence.time = 12; player.seek(0.75)
    expect(sequence.pending).toEqual([90])
    expect(metronome.start).toHaveBeenCalledTimes(starts)
    expect(listener.onTime).toHaveBeenLastCalledWith(90, 120)
    sequence.acknowledge(90)
    expect(metronome.start).toHaveBeenLastCalledWith(90, 1, false, expect.any(Function))
    const clock = metronome.start.mock.lastCall[3]
    sequence.time = 90.25; sequence.playbackRate = 2
    expect(clock()).toEqual({ time: 90.25, rate: 2 })
    player.destroy()
  })
  it('coalesces rapid forward and backward drags and ignores intermediate acknowledgements', async () => {
    const { player, sequence, metronome, listener } = await create(); await player.play()
    const starts = metronome.start.mock.calls.length
    player.seek(0.1); player.seek(0.7); player.seek(0.4)
    expect(sequence.pending).toEqual([12])
    sequence.acknowledge(12)
    expect(sequence.pending).toEqual([12, 48])
    expect(metronome.start).toHaveBeenCalledTimes(starts)
    sequence.acknowledge(48)
    expect(metronome.start).toHaveBeenCalledTimes(starts + 1)
    expect(metronome.start.mock.lastCall[0]).toBe(48)
    expect(listener.onTime.mock.calls.slice(-2).map((call: number[]) => call[0])).not.toContain(12)
    player.destroy()
  })
  it('does not restart clicks on pause, and resume waits for a pending seek', async () => {
    const { player, sequence, metronome } = await create(); await player.play()
    player.seek(0.5); player.pause()
    const starts = metronome.start.mock.calls.length
    const resume = player.play(); await vi.advanceTimersByTimeAsync(0)
    expect(sequence.play).toHaveBeenCalledTimes(1)
    sequence.acknowledge(60); await resume
    expect(sequence.play).toHaveBeenCalledTimes(2)
    expect(metronome.start).toHaveBeenCalledTimes(starts + 1)
    expect(metronome.start.mock.lastCall[0]).toBe(60)
    player.destroy()
  })
  it('applies speed and toggle changes during seeking only after the final acknowledgement', async () => {
    const { player, sequence, metronome } = await create(); await player.play()
    player.seek(0.25); const starts = metronome.start.mock.calls.length
    player.setTempo(240); player.setMetronomeEnabled(false); player.setMetronomeEnabled(true)
    expect(metronome.start).toHaveBeenCalledTimes(starts)
    sequence.acknowledge(30)
    expect(metronome.start).toHaveBeenLastCalledWith(30, 2, false, expect.any(Function))
    player.destroy()
  })
  it('stops pending synchronization on disposal and stops clicks when the song ends', async () => {
    const { player, sequence, metronome, listener } = await create(); await player.play()
    sequence.emit('songEnded'); expect(listener.onEnded).toHaveBeenCalledOnce()
    player.seek(0.5); const playing = player.play(); await vi.advanceTimersByTimeAsync(0)
    const starts = metronome.start.mock.calls.length
    player.destroy(); sequence.acknowledge(60); await playing
    expect(metronome.start).toHaveBeenCalledTimes(starts)
    expect(metronome.stop).toHaveBeenCalled()
  })
})
