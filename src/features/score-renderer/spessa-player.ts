import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib'
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url'

const soundFont = { name: 'FluidR3-GM-Piano-SF3', url: '/soundfonts/FluidR3_GM-Piano.sf3' } as const
export function seekTimeAtProgress(duration: number, progress: number) {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  const normalized = Math.max(0, Math.min(1, progress))
  // SpessaSynth cannot seek to the exact end because there is no next event.
  return Math.min(normalized * duration, Math.max(0, duration - 0.001))
}

export type PlayerListener = {
  onEnded: () => void
  onTime: (seconds: number, duration: number, sourceSeconds: number) => void
}

export class SpessaPlayer {
  private animationFrame = 0
  private readonly context: AudioContext
  private readonly synth: WorkletSynthesizer
  private readonly sequencer: Sequencer
  private readonly listener: PlayerListener
  readonly soundFontName: string

  private constructor(context: AudioContext, synth: WorkletSynthesizer, sequencer: Sequencer, listener: PlayerListener, soundFontName: string) {
    this.context = context
    this.synth = synth
    this.sequencer = sequencer
    this.listener = listener
    this.soundFontName = soundFontName
    this.sequencer.eventHandler.addEvent('songEnded', 'm3n-player', () => {
      this.stopProgressLoop()
      this.listener.onTime(this.sequencer.duration, this.sequencer.duration, this.sourceTimeAt(this.sequencer.duration))
      this.listener.onEnded()
    })
  }

  static async create(midi: ArrayBuffer, listener: PlayerListener) {
    const response = await fetch(soundFont.url)
    if (!response.ok) throw new Error(`无法加载 ${soundFont.name} 音色文件。`)
    const soundBank = await response.arrayBuffer()
    const context = new AudioContext()
    await context.audioWorklet.addModule(processorUrl)
    const synth = new WorkletSynthesizer(context)
    synth.connect(context.destination)
    await synth.soundBankManager.addSoundBank(soundBank, soundFont.name)
    await synth.isReady
    const sequencer = new Sequencer(synth, { skipToFirstNoteOn: false })
    sequencer.loadNewSongList([{ binary: midi, fileName: 'm3n-score.mid' }])
    return new SpessaPlayer(context, synth, sequencer, listener, soundFont.name)
  }

  get paused() {
    return this.sequencer.paused
  }

  get duration() {
    return this.sequencer.duration
  }

  sourceTimeAt(playbackSeconds: number) {
    return playbackSeconds
  }

  async play() {
    await this.context.resume()
    this.sequencer.play()
    this.startProgressLoop()
  }

  pause() {
    this.sequencer.pause()
    this.stopProgressLoop()
  }

  seek(progress: number) {
    this.sequencer.currentTime = seekTimeAtProgress(this.sequencer.duration, progress)
    this.emitProgress()
  }

  setSpeed(percent: number) {
    this.sequencer.playbackRate = percent / 100
  }

  destroy() {
    this.stopProgressLoop()
    this.sequencer.pause()
    this.synth.destroy()
    void this.context.close()
  }

  private emitProgress = () => {
    const playbackSeconds = this.sequencer.currentHighResolutionTime
    this.listener.onTime(playbackSeconds, this.sequencer.duration, this.sourceTimeAt(playbackSeconds))
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
