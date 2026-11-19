import { BasicMIDI } from 'spessasynth_core'
import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib' 
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url'
import { loadSampledTone, type PlaybackTone } from './playback-tones.js'
import { createSyntheticSoundFont } from './synthetic-soundfont.js'
import { Metronome, buildMetronomeBeats, initialBeatDurationSeconds } from './metronome.js'
import { StartupCue, type StartupBeat } from './startup-cue.js'

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
  onStartupBeat?: (beat: StartupBeat | null, seconds: number) => void
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
  private playToken = 0
  private toneVersion = 0
  private destroyed = false
  private requestedSeek: number | undefined
  private inFlightSeek: number | undefined
  private readonly seekWaiters = new Set<() => void>()
  private readonly startup: StartupCue
  private readonly soundBanks = new Map<PlaybackTone, Promise<void>>()

  private constructor(context: AudioContext, synth: WorkletSynthesizer, sequencer: Sequencer, listener: PlayerListener, metronome: Metronome, private readonly initialBpm: number, tone: PlaybackTone) {
    this.soundBanks.set(tone, Promise.resolve())
    this.startup = new StartupCue(context)
    this.context = context
    this.synth = synth
    this.sequencer = sequencer
    this.listener = listener
    this.metronome = metronome
    this.sequencer.eventHandler.addEvent('timeChange', 'm3n-transport', time => {
      if (this.destroyed) return
      if (this.inFlightSeek !== undefined) {
        // setTime is asynchronous. Only its acknowledgement can establish a
        // new audio-clock anchor; coalesce further drags while it is pending.
        if (Math.abs(time - this.inFlightSeek) > 0.005) return
        this.inFlightSeek = undefined
        if (this.requestedSeek !== undefined && Math.abs(this.requestedSeek - time) > 0.005) {
          this.dispatchSeek(); return
        }
        this.requestedSeek = undefined
        for (const resolve of this.seekWaiters) resolve()
        this.seekWaiters.clear()
      }
      this.syncMetronome()
      this.emitProgress()
    })
    this.sequencer.eventHandler.addEvent('songEnded', 'm3n-player', () => {
      this.stopProgressLoop()
      this.metronome.stop()
      this.listener.onTime(this.sequencer.duration, this.sequencer.duration)
      this.listener.onEnded()
    })
  }

  static async create(midi: ArrayBuffer, listener: PlayerListener, transpose = 0, tone: PlaybackTone = 'synth') {
    const soundBank = tone === 'synth' ? createSyntheticSoundFont() : await loadSampledTone(tone)
    const context = new AudioContext()
    try {
      await context.audioWorklet.addModule(processorUrl)
      const synth = new WorkletSynthesizer(context)
      synth.connect(context.destination)
      await synth.soundBankManager.addSoundBank(soundBank, tone)
      await synth.isReady
      const sequencer = new Sequencer(synth, { skipToFirstNoteOn: false })
      await new Promise<void>((resolve, reject) => {
        const clean = () => {
          sequencer.eventHandler.removeEvent('timeChange', 'm3n-ready')
          sequencer.eventHandler.removeEvent('midiError', 'm3n-ready')
        }
        sequencer.eventHandler.addEvent('timeChange', 'm3n-ready', () => { clean(); resolve() })
        sequencer.eventHandler.addEvent('midiError', 'm3n-ready', error => { clean(); reject(new Error(String(error))) })
        sequencer.loadNewSongList([{ binary: midi, fileName: 'm3n-score.mid' }])
      })
      const parsedSequence = BasicMIDI.fromArrayBuffer(midi)
      const player = new SpessaPlayer(
        context,
        synth,
        sequencer,
        listener,
        new Metronome(context, buildMetronomeBeats(parsedSequence)),
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
    return this.sequencer.paused && !this.startup.active
  }

  get duration() {
    return this.sequencer.duration
  }

  async play() {
    const token = ++this.playToken
    await this.context.resume()
    if (token !== this.playToken || this.destroyed) return
    if (this.sequencer.currentTime >= this.sequencer.duration - 0.02) this.seek(0)
    await this.waitForSeek()
    if (token !== this.playToken || this.destroyed) return
    const cuePosition = Math.max(0, this.sequencer.currentTime)
    await this.startup.play(this.initialBpm * this.sequencer.playbackRate, beat => this.listener.onStartupBeat?.(beat, cuePosition))
    await this.waitForSeek()
    if (token !== this.playToken || this.destroyed) return
    this.listener.onTime(Math.max(0, this.sequencer.currentTime), this.sequencer.duration)
    this.sequencer.play()
    this.syncMetronome()
    this.startProgressLoop()
  }

  pause() {
    this.playToken += 1
    this.startup.cancel()
    this.metronome.stop()
    this.sequencer.pause()
    this.stopProgressLoop()
  }

  seek(progress: number) {
    if (this.destroyed) return
    this.startup.cancel()
    this.metronome.stop()
    this.requestedSeek = seekTimeAtProgress(this.sequencer.duration, progress)
    if (this.inFlightSeek === undefined) this.dispatchSeek()
    this.emitProgress()
  }

  private dispatchSeek() {
    this.inFlightSeek = this.requestedSeek
    if (this.inFlightSeek !== undefined) this.sequencer.currentTime = this.inFlightSeek
  }

  private waitForSeek() {
    return this.requestedSeek === undefined ? Promise.resolve() : new Promise<void>(resolve => this.seekWaiters.add(resolve))
  }

  private syncMetronome() {
    if (this.destroyed || this.requestedSeek !== undefined || !this.metronomeEnabled || this.sequencer.paused) {
      this.metronome.stop(); return
    }
    this.metronome.start(this.sequencer.currentTime, this.sequencer.playbackRate, false,
      () => ({ time: this.sequencer.currentTime, rate: this.sequencer.playbackRate }))
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
    this.startup.setTempo(this.initialBpm * this.sequencer.playbackRate)
    this.syncMetronome()
  }

  setMetronomeEnabled(enabled: boolean) {
    this.metronomeEnabled = enabled
    this.syncMetronome()
  }

  destroy() {
    this.destroyed = true
    this.toneVersion += 1
    this.playToken += 1
    this.startup.cancel()
    this.requestedSeek = this.inFlightSeek = undefined
    for (const resolve of this.seekWaiters) resolve()
    this.seekWaiters.clear()
    this.stopProgressLoop()
    this.metronome.stop()
    this.sequencer.pause()
    this.synth.destroy()
    void this.context.close()
  }

  private emitProgress = () => {
    if (this.startup.active) return
    const playbackSeconds = this.requestedSeek ?? Math.max(0, this.sequencer.currentHighResolutionTime)
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
