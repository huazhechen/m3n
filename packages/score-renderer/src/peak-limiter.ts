/** Stereo-linked, 3ms lookahead peak limiter. Gain changes preserve the stereo
 * image and waveform; no hard clipping or harmonic-generating waveshaper.
 */
export class PeakLimiter {
  private readonly length: number
  private readonly left: Float32Array
  private readonly right: Float32Array
  private readonly peaks: Float64Array
  private readonly positions: Float64Array
  private readonly release: number
  private sample = 0
  private head = 0
  private tail = 0
  private gain = 1
  readonly ceiling = 0.94

  constructor(sampleRate: number) {
    this.length = Math.ceil(sampleRate * 0.003) + 1
    this.left = new Float32Array(this.length)
    this.right = new Float32Array(this.length)
    this.peaks = new Float64Array(this.length + 1)
    this.positions = new Float64Array(this.length + 1)
    this.release = 1 - Math.exp(-1 / (sampleRate * 0.08))
  }

  process(left: Float32Array, right: Float32Array, outLeft: Float32Array, outRight: Float32Array) {
    const size = this.peaks.length
    for (let i = 0; i < outLeft.length; i++) {
      const index = this.sample++, slot = index % this.length
      const l = Number.isFinite(left[i]) ? left[i]! : 0
      const r = Number.isFinite(right[i]) ? right[i]! : 0
      this.left[slot] = l
      this.right[slot] = r
      const peak = Math.max(Math.abs(l), Math.abs(r))
      while (this.head !== this.tail && this.positions[this.head]! <= index - this.length) this.head = (this.head + 1) % size
      while (this.head !== this.tail && this.peaks[(this.tail + size - 1) % size]! <= peak) this.tail = (this.tail + size - 1) % size
      this.peaks[this.tail] = peak
      this.positions[this.tail] = index
      this.tail = (this.tail + 1) % size
      const target = Math.min(1, this.ceiling / Math.max(this.peaks[this.head]!, 1e-12))
      this.gain = target < this.gain ? target : Math.min(target, this.gain + (1 - this.gain) * this.release)
      const read = (slot + 1) % this.length
      outLeft[i] = this.left[read]! * this.gain
      outRight[i] = this.right[read]! * this.gain
    }
  }
}
