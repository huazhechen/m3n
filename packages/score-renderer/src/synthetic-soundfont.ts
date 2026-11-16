import { BasicInstrument, BasicPreset, BasicSample, BasicSoundBank, GeneratorTypes, SampleTypes } from 'spessasynth_core'

/** A soft periodic tone generated locally; no sample bank is fetched. */
export function createSyntheticSoundFont() {
  const bank = new BasicSoundBank('sf2')
  const audio = Float32Array.from({ length: 256 }, (_, index) => {
    const phase = index * Math.PI * 2 / 256
    return (Math.sin(phase) + 0.12 * Math.sin(phase * 2)) * 0.5
  })
  // 28160 / 256 = 110 Hz (A2, MIDI 45), so the tuning is exact.
  const sample = new BasicSample('Soft sine', 28160, 45, 0, SampleTypes.monoSample, 0, 256)
  sample.setAudioData(audio, 28160)
  bank.addSamples(sample)
  const instrument = new BasicInstrument()
  instrument.name = 'Synthetic'
  instrument.globalZone.setGenerator(GeneratorTypes.sampleModes, 1)
  instrument.globalZone.setGenerator(GeneratorTypes.attackVolEnv, -9600)
  instrument.globalZone.setGenerator(GeneratorTypes.releaseVolEnv, -3600)
  instrument.globalZone.setGenerator(GeneratorTypes.initialAttenuation, 120)
  instrument.createZone(sample)
  bank.addInstruments(instrument)
  const preset = new BasicPreset(bank)
  preset.name = 'Synthetic'
  preset.createZone(instrument)
  bank.addPresets(preset)
  bank.soundBankInfo.name = 'M3N Synthetic Tone'
  bank.flush()
  return bank.writeSF2()
}
