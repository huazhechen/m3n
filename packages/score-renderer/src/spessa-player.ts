import { BasicMIDI } from 'spessasynth_core'
import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib' 
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url'
import { Metronome, buildMetronomeBeats, initialBeatDurationSeconds } from './metronome.js'

const soundFont = { name: 'FluidR3-GM-Piano-SF3', url: '/soundfonts/FluidR3_GM-Piano.sf3' } as const
export function seekTimeAtProgress(duration: number, progress: number) {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  const normalized = Math.max(0, Math.min(1, progress))
  // SpessaSynth cannot seek to the exact end because there is no next event.
  return Math.min(normalized * duration, Math.max(0, duration - 0.001))
}

type PlayerListener = {
  onEnded: () => void
  onTime: (seconds: number, duration: number) => void
}

/** Transpose melodic MIDI channels while leaving percussion (channel 10) intact. */
export function transposeMidiData(midi: ArrayBuffer, semitones: number) {
  const shift = Math.max(-12, Math.min(12, Math.trunc(semitones)))
  if (shift === 0) return midi
  const sequence = BasicMIDI.fromArrayBuffer(midi)
  const channels = new Set<number>()
  sequence.tracks.forEach((track) => track.channels.forEach((channel) => channels.add(channel)))
  const changes = new Map<number, { keyShift: number }>()
  channels.forEach((channel) => {
    if (channel !== 9) changes.set(channel, { keyShift: shift })
  })
  if (changes.size === 0) return midi
  sequence.modify({ channels: changes })
  return sequence.writeMIDI()
}

export class SpessaPlayer {
  private animationFrame = 0
  private readonly context: AudioContext
  private readonly synth: WorkletSynthesizer
  private readonly sequencer: Sequencer
  private readonly listener: PlayerListener
  private readonly metronome: Metronome
  private metronomeEnabled = false
  private countInPending = true
  private playToken = 0

  private constructor(context: AudioContext, synth: WorkletSynthesizer, sequencer: Sequencer, listener: PlayerListener, metronome: Metronome) {
    this.context = context
    this.synth = synth
    this.sequencer = sequencer
    this.listener = listener
    this.metronome = metronome
    this.sequencer.eventHandler.addEvent('songEnded', 'm3n-player', () => {
      this.stopProgressLoop()
      this.listener.onTime(this.sequencer.duration, this.sequencer.duration)
      this.listener.onEnded()
    })
  }

  static async create(midi: ArrayBuffer, listener: PlayerListener, transpose = 0, countInBeats = 0) {
    const response = await fetch(soundFont.url)
    if (!response.ok) throw new Error(`无法加载 ${soundFont.name} 音色文件。`)
    const soundBank = await response.arrayBuffer()
    const context = new AudioContext()
    await context.audioWorklet.addModule(processorUrl)
    const synth = new WorkletSynthesizer(context)
    synth.connect(context.destination)
    await synth.soundBankManager.addSoundBank(soundBank, soundFont.name)
    await synth.isReady
    const midiSequence = transposeMidiData(midi, transpose)
    const sequencer = new Sequencer(synth, { skipToFirstNoteOn: false })
    sequencer.loadNewSongList([{ binary: midiSequence, fileName: 'm3n-score.mid' }])
    const parsedSequence = BasicMIDI.fromArrayBuffer(midi)
    return new SpessaPlayer(
      context,
      synth,
      sequencer,
      listener,
      new Metronome(context, buildMetronomeBeats(parsedSequence), countInBeats, initialBeatDurationSeconds(parsedSequence)),
    )
  }

  get paused() {
    return this.sequencer.paused
  }

  get duration() {
    return this.sequencer.duration
  }

  async play() {
    await this.context.resume()
    const token = ++this.playToken
    const countInSeconds = this.metronomeEnabled && this.countInPending
      ? this.metronome.countInDurationSeconds
      : 0
    if (this.metronomeEnabled) this.metronome.start(this.sequencer.currentHighResolutionTime, this.sequencer.playbackRate, countInSeconds > 0)
    if (countInSeconds > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, countInSeconds * 1000 / Math.max(0.01, this.sequencer.playbackRate)))
      if (token !== this.playToken) return
    }
    this.countInPending = false
    this.sequencer.play()
    this.startProgressLoop()
  }

  pause() {
    this.playToken += 1
    this.sequencer.pause()
    this.metronome.stop()
    this.stopProgressLoop()
  }

  seek(progress: number) {
    this.sequencer.currentTime = seekTimeAtProgress(this.sequencer.duration, progress)
    if (this.metronomeEnabled && !this.sequencer.paused) this.metronome.start(this.sequencer.currentHighResolutionTime, this.sequencer.playbackRate)
    this.emitProgress()
  }

  setSpeed(percent: number) {
    this.sequencer.playbackRate = percent / 100
    if (this.metronomeEnabled && !this.sequencer.paused) this.metronome.start(this.sequencer.currentHighResolutionTime, this.sequencer.playbackRate)
  }

  setMetronomeEnabled(enabled: boolean) {
    this.metronomeEnabled = enabled
    if (enabled && !this.sequencer.paused) this.metronome.start(this.sequencer.currentHighResolutionTime, this.sequencer.playbackRate)
    else this.metronome.stop()
  }

  destroy() {
    this.stopProgressLoop()
    this.metronome.stop()
    this.sequencer.pause()
    this.synth.destroy()
    void this.context.close()
  }

  private emitProgress = () => {
    const playbackSeconds = this.sequencer.currentHighResolutionTime
    this.listener.onTime(playbackSeconds, this.sequencer.duration)
  }

  private startProgressLoop() {
    this.stopProgressLoop()
    const tick = () => {
      this.emitProgress()
      this.animationFrame = requestAnimationFrame(tick)
    }
    this.animationFrame = requestAnimationFrame(tick)
  }

  private stopProgressLoop() {
    cancelAnimationFrame(this.animationFrame)
    this.animationFrame = 0
  }
}
