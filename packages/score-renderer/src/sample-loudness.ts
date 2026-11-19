/** Calibrate the musical body, rather than letting one short transient set the
 * volume of an entire sample. Keep linear gain (no waveshaping) and PCM headroom.
 */
export function normalizeSampleLoudness(audio: Float32Array, sampleRate: number) {
  const length = Math.min(audio.length, Math.round(sampleRate))
  let energy = 0, peak = 0
  for (let i = 0; i < audio.length; i++) {
    const value = audio[i]!
    if (!Number.isFinite(value)) throw new Error('音色采样包含无效数据。')
    peak = Math.max(peak, Math.abs(value))
    if (i < length) energy += value * value
  }
  if (peak === 0) return
  const rms = Math.sqrt(energy / length)
  const gain = Math.min(0.40 / rms, 0.90 / peak)
  for (let i = 0; i < audio.length; i++) audio[i] = audio[i]! * gain
}
