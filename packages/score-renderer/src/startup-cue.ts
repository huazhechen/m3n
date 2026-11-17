import { Metronome } from './metronome.js'

export type StartupBeat = 1 | 2 | 3

/** Three equal pulses on the audio clock, independent of meter and pickup. */
export class StartupCue {
  private readonly clicks: Metronome
  private timer = 0
  private anchor = 0
  private elapsed = 0
  private rate = 1
  private beat: StartupBeat | null = null
  private finish: (() => void) | undefined
  private listener: ((beat: StartupBeat | null) => void) | undefined

  constructor(private readonly context: AudioContext) {
    this.clicks = new Metronome(context, [0, 1, 2].map(time => ({ time, accent: false })))
  }

  get active() { return this.finish !== undefined }
  private position = () => this.elapsed + (this.context.currentTime - this.anchor) * this.rate

  play(bpm: number, listener: (beat: StartupBeat | null) => void) {
    this.cancel()
    this.elapsed = 0; this.anchor = this.context.currentTime; this.rate = bpm / 60
    this.listener = listener
    return new Promise<void>(resolve => {
      this.finish = resolve
      this.scheduleClicks()
      this.tick()
    })
  }

  setTempo(bpm: number) {
    if (!this.active) return
    this.elapsed = this.position(); this.anchor = this.context.currentTime; this.rate = bpm / 60
    this.scheduleClicks()
  }

  private scheduleClicks() {
    this.clicks.start(this.position(), this.rate)
  }

  private tick = () => {
    const position = this.position()
    if (position >= 3) { this.cancel(); return }
    const beat = (Math.floor(Math.max(0, position)) + 1) as StartupBeat
    if (beat !== this.beat) { this.beat = beat; this.listener?.(beat) }
    this.timer = window.setTimeout(this.tick, 10)
  }

  cancel() {
    window.clearTimeout(this.timer); this.timer = 0
    this.clicks.stop()
    const resolve = this.finish
    this.finish = undefined
    if (this.beat !== null) this.listener?.(null)
    this.beat = null; this.listener = undefined
    resolve?.()
  }
}
