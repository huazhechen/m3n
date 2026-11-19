import { BasicInstrument, BasicPreset, BasicSample, BasicSoundBank, GeneratorTypes, SampleTypes } from 'spessasynth_core'

const SAMPLE_RATE = 28160
const timecents = (seconds: number) => Math.round(1200 * Math.log2(seconds))
let cachedBank: ArrayBuffer | undefined

/** Project a two-operator FM cycle onto safe harmonics before resampling it. */
function fmCycle(period: number, index: number, ratio: number, harmonics: number) {
  const resolution = 512
  const fm = Float64Array.from({ length: resolution }, (_, i) => {
    const phase = 2 * Math.PI * i / resolution
    return Math.sin(phase + index * Math.sin(ratio * phase))
  })
  const cycle = new Float32Array(period)
  for (let harmonic = 1; harmonic <= harmonics; harmonic++) {
    const amplitude = fm.reduce((sum, value, i) => sum + value * Math.sin(2 * Math.PI * harmonic * i / resolution), 0) * 2 / resolution
    if (Math.abs(amplitude) < 0.00001) continue
    for (let i = 0; i < period; i++) cycle[i] = cycle[i]! + amplitude * Math.sin(2 * Math.PI * harmonic * i / period)
  }
  return cycle
}

/** Procedural FM electric piano: soft body without metallic tines or downloaded samples. */
export function createSyntheticSoundFont() {
  if (cachedBank) return cachedBank.slice(0)
  const bank = new BasicSoundBank('sf2')
  const instrument = new BasicInstrument()
  instrument.name = 'Soft FM electric piano'
  instrument.globalZone.setGenerator(GeneratorTypes.sampleModes, 1)
  instrument.globalZone.setGenerator(GeneratorTypes.attackVolEnv, timecents(0.012))
  instrument.globalZone.setGenerator(GeneratorTypes.decayVolEnv, timecents(2.5))
  instrument.globalZone.setGenerator(GeneratorTypes.sustainVolEnv, 0)
  instrument.globalZone.setGenerator(GeneratorTypes.releaseVolEnv, timecents(0.18))
  instrument.globalZone.setGenerator(GeneratorTypes.initialAttenuation, 0)

  // Octave-spaced A roots have exact integer periods at 28160 Hz. Each sample
  // includes its changing attack, followed by two identical sustain-loop cycles.
  for (let register = 0; register < 8; register++) {
    const root = 33 + register * 12
    const period = 512 / 2 ** register
    const min = register === 0 ? 0 : root - 6
    const max = register === 7 ? 127 : root + 5
    const topFrequency = 440 * 2 ** ((max - 69) / 12)
    const harmonics = Math.min(31, Math.floor(19845 / topFrequency), period / 2 - 1)
    const sustain = fmCycle(period, 0.08, 1, harmonics)
    // Low, integer harmonics add presence on small speakers without a metallic
    // tine. Roll off upper partials gradually as the register gets higher.
    const presence = new Float32Array(period)
    for (const [harmonic, level] of [[2, 0.28], [3, 0.16], [4, 0.07], [5, 0.03]] as const) {
      if (harmonic > harmonics) continue
      const amplitude = level * Math.exp(-((harmonic * topFrequency / 2800) ** 2))
      for (let i = 0; i < period; i++) presence[i] = presence[i]! + amplitude * Math.sin(2 * Math.PI * harmonic * i / period)
    }
    const loopStart = Math.ceil(0.75 * SAMPLE_RATE / period) * period
    const loopEnd = loopStart + 2 * period
    const attackSeconds = loopStart / SAMPLE_RATE
    const attack = fmCycle(period, 1.0, 1, harmonics)
    const audio = Float32Array.from({ length: loopEnd }, (_, i) => {
      const t = i / SAMPLE_RATE
      const phase = i % period
      // Finish the timbre transition before the loop, so there is no seam.
      const gate = Math.max(0, Math.min(1, (attackSeconds - 0.12 - t) / 0.12))
      const brightness = Math.exp(-t / 0.32) * gate
      return sustain[phase]! + presence[phase]! + brightness * (attack[phase]! - sustain[phase]!)
    })
    const peak = audio.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0)
    for (let i = 0; i < audio.length; i++) audio[i] = audio[i]! * 0.75 / peak
    const sample = new BasicSample(`FM EP ${root}`, SAMPLE_RATE, root, 0, SampleTypes.monoSample, loopStart, loopEnd)
    sample.setAudioData(audio, SAMPLE_RATE)
    bank.addSamples(sample)
    const zone = instrument.createZone(sample)
    zone.keyRange = { min, max }
    zone.velRange = { min: 0, max: 127 }
  }
  bank.addInstruments(instrument)
  const preset = new BasicPreset(bank)
  preset.name = 'Soft FM electric piano'
  preset.createZone(instrument)
  bank.addPresets(preset)
  bank.soundBankInfo.name = 'M3N Soft FM Electric Piano'
  bank.flush()
  cachedBank = bank.writeSF2()
  // AudioWorklet transfers can detach buffers, so keep the cached copy private.
  return cachedBank.slice(0)
}
