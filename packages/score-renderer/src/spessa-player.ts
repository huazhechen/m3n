import { BasicMIDI } from 'spessasynth_core'
import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib' 
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url'
import { loadSampledTone, type PlaybackTone } from './playback-tones.js'
import { createSyntheticSoundFont } from './synthetic-soundfont.js'
import { Metronome, buildMetronomeBeats, initialBeatDurationSeconds } from './metronome.js'

export function seekTimeAtProgress(duration: number, progress: number) {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  const normalized = Math.max(0, Math.min(1, progress))
  // SpessaSynth cannot seek to the exact end because there is no next event.
  return Math.min(normalized * duration, Math.max(0, duration - 0.001))
}

/** BPM uses the MIDI time signature's denominator, matching the metronome. */
export function playbackRateAtBpm(bpm: number, initialBpm: number) {
  if (!Number.isFinite(bpm) || !Number.isFinite(initialBpm) || initialBpm <= 0) throw new Error('播放速度无效。')
  return Math.max(10, Math.min(240, bpm)) / initialBpm
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
  private toneVersion = 0
  private destroyed = false
  private readonly soundBanks = new Map<PlaybackTone, Promise<void>>()

  private constructor(context: AudioContext, synth: WorkletSynthesizer, sequencer: Sequencer, listener: PlayerListener, metronome: Metronome, private readonly initialBpm: number, tone: PlaybackTone) {
    this.soundBanks.set(tone, Promise.resolve())
    this.context = context
    this.synth = synth
    this.sequencer = sequencer
    this.listener = listener
    this.metronome = metronome
    this.sequencer.eventHandler.addEvent('songEnded', 'm3n-player', () => {
      this.stopProgressLoop()
      this.countInPending = true
      this.listener.onTime(this.sequencer.duration, this.sequencer.duration)
      this.listener.onEnded()
    })
  }

  static async create(midi: ArrayBuffer, listener: PlayerListener, transpose = 0, countInBeats = 0, tone: PlaybackTone = 'synth') {
    const soundBank = tone === 'synth' ? createSyntheticSoundFont() : await loadSampledTone(tone)
    const context = new AudioContext()
    try {
      await context.audioWorklet.addModule(processorUrl)
      const synth = new WorkletSynthesizer(context)
      synth.connect(context.destination)
      await synth.soundBankManager.addSoundBank(soundBank, tone)
      await synth.isReady
      const sequencer = new Sequencer(synth, { skipToFirstNoteOn: false })
      sequencer.loadNewSongList([{ binary: midi, fileName: 'm3n-score.mid' }])
      const parsedSequence = BasicMIDI.fromArrayBuffer(midi)
      const player = new SpessaPlayer(
        context,
        synth,
        sequencer,
        listener,
        new Metronome(context, buildMetronomeBeats(parsedSequence), countInBeats, initialBeatDurationSeconds(parsedSequence)),
        60 / initialBeatDurationSeconds(parsedSequence), tone,
      )
      player.setTranspose(transpose)
      return player
    } catch (error) {
      await context.close()
      throw error
    }
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
    const startsAtBeginning = this.countInPending || this.sequencer.currentHighResolutionTime <= 0.01
    const countInSeconds = this.metronomeEnabled && startsAtBeginning
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

  /** Tune active and future melodic voices without touching the MIDI clock or note-off keys. */
  setTranspose(semitones: number) {
    if (this.destroyed || !Number.isFinite(semitones)) return
    const shift = Math.max(-12, Math.min(12, Math.trunc(semitones)))
    // keyShift cuts sounding notes in SpessaSynth. System fineTune accepts cents
    // beyond one semitone, updates held notes and leaves percussion untouched.
    this.synth.setSystemParameter('fineTune', shift * 100)
  }

  /** Keep the current bank sounding while another bank downloads and decodes. */
  async setTone(tone: PlaybackTone) {
    const version = ++this.toneVersion
    let preparation = this.soundBanks.get(tone)
    if (!preparation) {
      preparation = (async () => {
        const data = tone === 'synth' ? createSyntheticSoundFont() : await loadSampledTone(tone)
        if (this.destroyed) return
        await this.synth.soundBankManager.addSoundBank(data, tone)
      })()
      this.soundBanks.set(tone, preparation)
      void preparation.catch(() => { if (this.soundBanks.get(tone) === preparation) this.soundBanks.delete(tone) })
    }
    await preparation
    if (this.destroyed || version !== this.toneVersion) return
    const manager = this.synth.soundBankManager
    // Existing voices keep their samples; subsequent notes use the selected bank.
    manager.priorityOrder = [tone, ...manager.priorityOrder.filter(id => id !== tone)]
  }

  setTempo(bpm: number) {
    this.sequencer.playbackRate = playbackRateAtBpm(bpm, this.initialBpm)
    if (this.metronomeEnabled && !this.sequencer.paused) this.metronome.start(this.sequencer.currentHighResolutionTime, this.sequencer.playbackRate)
  }

  setMetronomeEnabled(enabled: boolean) {
    this.metronomeEnabled = enabled
    if (enabled && !this.sequencer.paused) this.metronome.start(this.sequencer.currentHighResolutionTime, this.sequencer.playbackRate)
    else this.metronome.stop()
  }

  destroy() {
    this.destroyed = true
    this.toneVersion += 1
    this.playToken += 1
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
