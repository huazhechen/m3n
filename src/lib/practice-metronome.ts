export type MetronomeSettings = { bpm: number; accents: boolean[] }
type Loop = { source: AudioBufferSourceNode; time: number; beatDuration: number; firstBeat: number; beats: number }

/** The audio thread loops a whole bar, even when background JS timers are throttled. */
export class PracticeMetronome {
  private context: AudioContext
  private animation = 0
  private startedAt: number | null = null
  private stopped = false
  private loops: Loop[] = []
  private settings: MetronomeSettings
  private onBeat: (beat: number) => void
  constructor(settings: MetronomeSettings, onBeat: (beat: number) => void, onInterrupted: () => void = () => {}) {
    this.settings = settings
    this.onBeat = onBeat
    this.context = new AudioContext()
    this.context.onstatechange = () => {
      if (this.startedAt !== null && !this.stopped && this.context.state !== 'running') onInterrupted()
    }
  }
  async start() {
    await this.context.resume()
    if (this.stopped) return
    if (this.context.state !== 'running') throw new Error('音频未能启动，请再次点击开始。')
    this.startedAt = this.context.currentTime + .03
    this.loops.push(this.createLoop(this.startedAt, 0))
    const animate = () => {
      const loop = this.currentLoop()
      if (loop && this.context.currentTime >= loop.time) {
        const beat = Math.floor((this.context.currentTime - loop.time) / loop.beatDuration)
        this.onBeat((loop.firstBeat + beat) % loop.beats)
      }
      this.animation = requestAnimationFrame(animate)
    }
    this.animation = requestAnimationFrame(animate)
  }
  update(settings: MetronomeSettings) {
    if (this.stopped || (settings.bpm === this.settings.bpm && settings.accents.length === this.settings.accents.length && settings.accents.every((value, index) => value === this.settings.accents[index]))) return
    const current = this.currentLoop()
    this.settings = settings
    if (!current) return
    // Replace any queued change and switch on the next beat of the audible loop.
    for (const loop of this.loops) {
      if (loop !== current) { loop.source.stop(); loop.source.disconnect() }
    }
    const steps = Math.max(0, Math.ceil((this.context.currentTime + .01 - current.time) / current.beatDuration))
    const time = current.time + steps * current.beatDuration
    const firstBeat = settings.accents.length === current.beats ? (current.firstBeat + steps) % current.beats : 0
    const next = this.createLoop(time, firstBeat)
    current.source.stop(time)
    this.loops = [current, next]
  }
  private currentLoop() {
    while (this.loops.length > 1 && this.loops[1]!.time <= this.context.currentTime) this.loops.shift()
    return this.loops[0]
  }
  private createLoop(time: number, firstBeat: number): Loop {
    const sampleRate = this.context.sampleRate
    const beatFrames = Math.round(sampleRate * 60 / this.settings.bpm)
    const beats = this.settings.accents.length
    const buffer = this.context.createBuffer(1, beatFrames * beats, sampleRate)
    const data = buffer.getChannelData(0)
    for (let beat = 0; beat < beats; beat++) {
      const frequency = this.settings.accents[beat] ? 1500 : 900
      for (let frame = 0; frame < Math.ceil(.085 * sampleRate); frame++) {
        const seconds = frame / sampleRate
        const gain = seconds < .002 ? seconds / .002 : seconds < .02 ? 1 : Math.pow(.001, (Math.min(seconds, .08) - .02) / .06)
        data[beat * beatFrames + frame] = Math.sin(2 * Math.PI * frequency * seconds) * gain
      }
    }
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(this.context.destination)
    source.onended = () => source.disconnect()
    const beatDuration = beatFrames / sampleRate
    source.start(time, firstBeat * beatDuration)
    return { source, time, beatDuration, firstBeat, beats }
  }
  /** Audio time stops advancing when the browser suspends the context. */
  get elapsedSeconds() { return this.startedAt === null ? 0 : Math.max(0, this.context.currentTime - this.startedAt) }
  get running() { return !this.stopped && this.context.state === 'running' }
  stop() {
    if (this.stopped) return
    this.stopped = true
    cancelAnimationFrame(this.animation)
    for (const loop of this.loops) { loop.source.stop(); loop.source.disconnect() }
    this.loops = []
    this.context.onstatechange = null
    void this.context.close().catch(() => {})
  }
}
