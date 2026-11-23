export type MetronomeSettings = { bpm: number; accents: boolean[] }
/** Schedule against the audio clock, independent of render and interval jitter. */
export class PracticeMetronome {
  private context: AudioContext
  private timer: ReturnType<typeof setInterval> | undefined
  private animation = 0
  private nextTime = 0
  private beat = 0
  private stopped = false
  private pending: { time: number; beat: number }[] = []
  private settings: MetronomeSettings
  private onBeat: (beat: number) => void
  constructor(settings: MetronomeSettings, onBeat: (beat: number) => void) {
    this.settings = settings
    this.onBeat = onBeat
    this.context = new AudioContext()
  }
  async start() {
    await this.context.resume()
    if (this.stopped) return
    if (this.context.state !== 'running') throw new Error('音频未能启动，请再次点击开始。')
    this.nextTime = this.context.currentTime + .03
    this.schedule()
    this.timer = setInterval(() => this.schedule(), 25)
    const animate = () => {
      while (this.pending[0] && this.pending[0].time <= this.context.currentTime) this.onBeat(this.pending.shift()!.beat)
      this.animation = requestAnimationFrame(animate)
    }
    this.animation = requestAnimationFrame(animate)
  }
  update(settings: MetronomeSettings) {
    if (settings.accents.length !== this.settings.accents.length) this.beat = 0
    this.settings = settings
  }
  private schedule() {
    if (this.nextTime < this.context.currentTime) this.nextTime = this.context.currentTime + .01
    while (this.nextTime < this.context.currentTime + .08) {
      const beat = this.beat % this.settings.accents.length
      const accent = this.settings.accents[beat]
      const oscillator = this.context.createOscillator()
      const envelope = this.context.createGain()
      oscillator.frequency.value = accent ? 1500 : 900
      envelope.gain.setValueAtTime(0, this.nextTime)
      envelope.gain.linearRampToValueAtTime(1, this.nextTime + .002)
      envelope.gain.setValueAtTime(1, this.nextTime + .02)
      envelope.gain.exponentialRampToValueAtTime(.001, this.nextTime + .08)
      oscillator.connect(envelope)
      envelope.connect(this.context.destination)
      oscillator.start(this.nextTime)
      oscillator.stop(this.nextTime + .085)
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect() }
      this.pending.push({ time: this.nextTime, beat })
      this.nextTime += 60 / this.settings.bpm
      this.beat = (beat + 1) % this.settings.accents.length
    }
  }
  get running() { return this.context.state === 'running' }
  stop() {
    if (this.stopped) return
    this.stopped = true
    clearInterval(this.timer)
    cancelAnimationFrame(this.animation)
    this.pending = []
    void this.context.close().catch(() => {})
  }
}
