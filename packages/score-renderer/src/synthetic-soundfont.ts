import { BasicInstrument, BasicPreset, BasicSample, BasicSoundBank, GeneratorTypes, SampleTypes } from 'spessasynth_core'

const SAMPLE_RATE = 28160
const PERIOD = 256
const PARTIALS = [1, 0.28, 0.14, 0.06, 0.025, 0.012]
const timecents = (seconds: number) => Math.round(1200 * Math.log2(seconds))

/** Warm additive tone generated locally, with a gentle envelope and no downloaded samples. */
export function createSyntheticSoundFont() {
  const bank = new BasicSoundBank('sf2')
  const instrument = new BasicInstrument()
  instrument.name = 'Warm additive'
  instrument.globalZone.setGenerator(GeneratorTypes.sampleModes, 1)
  instrument.globalZone.setGenerator(GeneratorTypes.attackVolEnv, timecents(0.012))
  instrument.globalZone.setGenerator(GeneratorTypes.decayVolEnv, timecents(0.6))
  instrument.globalZone.setGenerator(GeneratorTypes.sustainVolEnv, 30)
  instrument.globalZone.setGenerator(GeneratorTypes.releaseVolEnv, timecents(0.12))
  instrument.globalZone.setGenerator(GeneratorTypes.initialAttenuation, 100)

  // Reduce upper partials in the high registers to keep them below the Nyquist
  // frequency at 44.1 kHz output. All bands keep the same fundamental and phase.
  const bands = [
    { min: 0, max: 83, partials: 6 },
    { min: 84, max: 107, partials: 4 },
    { min: 108, max: 119, partials: 2 },
    { min: 120, max: 127, partials: 1 },
  ]
  for (const band of bands) {
    const audio = Float32Array.from({ length: PERIOD }, (_, index) => {
      const phase = index * Math.PI * 2 / PERIOD
      return PARTIALS.slice(0, band.partials).reduce((sum, amplitude, harmonic) => sum + amplitude * Math.sin(phase * (harmonic + 1)), 0)
    })
    const peak = Math.max(...audio.map(Math.abs))
    for (let index = 0; index < audio.length; index++) audio[index] = audio[index]! * 0.55 / peak
    // 28160 / 256 = 110 Hz: A2, MIDI 45, with an exact periodic loop.
    const sample = new BasicSample(`Warm additive ${band.partials}`, SAMPLE_RATE, 45, 0, SampleTypes.monoSample, 0, PERIOD)
    sample.setAudioData(audio, SAMPLE_RATE)
    bank.addSamples(sample)
    instrument.createZone(sample).keyRange = { min: band.min, max: band.max }
  }
  bank.addInstruments(instrument)
  const preset = new BasicPreset(bank)
  preset.name = 'Warm additive'
  preset.createZone(instrument)
  bank.addPresets(preset)
  bank.soundBankInfo.name = 'M3N Warm Additive Tone'
  bank.flush()
  return bank.writeSF2()
}
