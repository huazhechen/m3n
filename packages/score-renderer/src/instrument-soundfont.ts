import { BasicInstrument, BasicPreset, BasicSample, BasicSoundBank, GeneratorTypes, SampleTypes } from 'spessasynth_core'
import { PLAYBACK_TONES, type GeneratedTone, type ToneGenerationProgress } from './tone-catalog.js'

const timecents = (seconds: number) => Math.round(1200 * Math.log2(seconds))
const layers = [{ min: 0, max: 54 }, { min: 55, max: 94 }, { min: 95, max: 127 }]
const roots = Array.from({ length: 16 }, (_, i) => 21 + i * 6)
const profiles = {
  piano: { attack: 0.003, release: 0.22, seconds: 2.4, decay: 5, sustain: 800 },
  guitar: { attack: 0.002, release: 0.14, seconds: 1.8, decay: 3, sustain: 800 },
  harmonica: { attack: 0.018, release: 0.10, seconds: 0.65, decay: 1, sustain: 0 },
  violin: { attack: 0.065, release: 0.22, seconds: 0.85, decay: 1, sustain: 0 },
  flute: { attack: 0.035, release: 0.16, seconds: 0.65, decay: 1, sustain: 0 },
}

/** Original additive voices, inspired by compact GM synthesis (TinySynth) and
 * frequency-dependent damping in plucked strings. No copied presets/recordings.
 */
export function createInstrumentSoundFont(tone: GeneratedTone, onProgress: (progress: ToneGenerationProgress) => void = () => {}) {
  const profile = profiles[tone]
  const label = PLAYBACK_TONES.find(item => item.value === tone)!.label
  const bank = new BasicSoundBank('sf2')
  const instrument = new BasicInstrument()
  instrument.name = `M3N ${tone}`
  instrument.globalZone.setGenerator(GeneratorTypes.sampleModes, 1)
  instrument.globalZone.setGenerator(GeneratorTypes.attackVolEnv, timecents(profile.attack))
  instrument.globalZone.setGenerator(GeneratorTypes.decayVolEnv, timecents(profile.decay))
  instrument.globalZone.setGenerator(GeneratorTypes.sustainVolEnv, profile.sustain)
  instrument.globalZone.setGenerator(GeneratorTypes.releaseVolEnv, timecents(profile.release))
  if (tone === 'violin' || tone === 'flute') {
    instrument.globalZone.setGenerator(GeneratorTypes.delayVibLFO, timecents(0.35))
    instrument.globalZone.setGenerator(GeneratorTypes.freqVibLFO, Math.round(1200 * Math.log2(5 / 8.176)))
    instrument.globalZone.setGenerator(GeneratorTypes.vibLfoToPitch, tone === 'violin' ? 12 : 5)
  }
  const total = roots.length * layers.length
  let completed = 0
  for (const [index, root] of roots.entries()) {
    const min = index === 0 ? 0 : root - 3
    const max = index === roots.length - 1 ? 127 : root + 2
    const frequency = 440 * 2 ** ((root - 69) / 12)
    const period = Math.max(16, Math.round(32000 / frequency))
    const rate = Math.round(period * frequency)
    const harmonics = Math.min(64, Math.floor(period / 2) - 1, Math.floor(14000 / (frequency * 2 ** ((max - root) / 12))))
    const plucked = tone === 'piano' || tone === 'guitar'
    // Wind/bow noise needs a longer loop than the tonal fundamental.
    const loopPeriod = plucked ? period : Math.max(2, Math.ceil(rate * 0.25 / period)) * period
    const loopStart = Math.ceil(profile.seconds * rate / loopPeriod) * loopPeriod
    const loopEnd = loopStart + 2 * loopPeriod
    for (const [layer, velocity] of layers.entries()) {
      const body = new Float32Array(period), bright = new Float32Array(period), transient = new Float32Array(period)
      for (let h = 1; h <= harmonics; h++) {
        const rolloff = Math.exp(-((h * frequency / (tone === 'flute' ? 6500 : 10500)) ** 2))
        let sustained: number, initial: number
        switch (tone) {
          case 'piano':
            sustained = h === 1 ? 1 : (h % 2 ? 0.48 : 0.32) / h ** 1.7
            initial = (0.35 + layer * 0.24) / h ** 1.15
            break
          case 'guitar':
            sustained = Math.sin(h * Math.PI * 0.23) / h ** 1.7
            initial = Math.sin(h * Math.PI * 0.23) * (0.8 + layer * 0.3) / h
            break
          case 'harmonica':
            sustained = (h % 2 ? 1 : 0.34 + layer * 0.08) / h ** 1.45
            initial = 0.25 / h
            break
          case 'violin': {
            const formant = 0.6 + 1.2 * Math.exp(-(((h * frequency - 2400) / 1200) ** 2))
            sustained = formant * (h % 2 ? 1 : 0.85) / h ** (1.3 - layer * 0.07)
            initial = 0.2 / h
            break
          }
          case 'flute':
            sustained = h === 1 ? 1 : h === 2 ? 0.10 + layer * 0.06 : 0.12 / h ** 2
            initial = h < 5 ? 0.15 / h : 0
            break
        }
        const phase = tone === 'piano' ? h * h * 0.13 : 0
        for (let i = 0; i < period; i++) {
          const wave = Math.sin(2 * Math.PI * h * i / period + phase) * rolloff
          body[i] = body[i]! + wave * sustained
          bright[i] = bright[i]! + wave * initial
          transient[i] = transient[i]! + wave * initial * Math.min(1, h / 6)
        }
      }
      const audio = new Float32Array(loopEnd)
      let seed = 12345 + root * 17 + layer, noiseLow = 0
      const noiseLoop = new Float32Array(loopPeriod)
      for (let i = 0; i < loopPeriod * 2; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0
        noiseLow += 0.25 * (seed / 2147483648 - noiseLow)
        if (i >= loopPeriod) noiseLoop[i - loopPeriod] = noiseLow
      }
      const breathLevel = tone === 'flute' ? 0.055 : tone === 'violin' ? 0.035 : 0.018
      const brightDecay = tone === 'guitar' ? 0.13 : tone === 'piano' ? 0.26 : 0.08
      const bodyDecay = tone === 'piano' ? 1.1 : 0.65
      const finalEnvelope = plucked ? 0.035 + 0.965 * Math.exp(-(loopStart - loopPeriod) / rate / bodyDecay) : 1
      for (let i = 0; i < loopEnd; i++) {
        const t = i / rate, phase = i % period
        // All evolving components fade out before three identical loop cycles.
        const x = Math.max(0, Math.min(1, (loopStart - loopPeriod - i) / rate / 0.12))
        const gate = x * x * (3 - 2 * x)
        const brightness = Math.exp(-t / brightDecay) * gate
        const envelope = plucked ? 0.035 + 0.965 * Math.exp(-t / bodyDecay) : 1
        const amplitude = finalEnvelope + gate * (envelope - finalEnvelope)
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0
        const noise = seed / 2147483648
        noiseLow += 0.15 * (noise - noiseLow)
        const breath = tone === 'flute' ? 0.035 : tone === 'violin' ? 0.025 : tone === 'harmonica' ? 0.012 : 0.04
        audio[i] = body[phase]! * amplitude + bright[phase]! * brightness
          + transient[phase]! * Math.exp(-t / 0.012) * gate * 0.25
          + (noise - noiseLow) * breath * Math.exp(-t / (plucked ? 0.012 : 0.16)) * gate
          + (plucked ? 0 : noiseLoop[i % loopPeriod]! * breathLevel)
      }
      const peak = audio.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0)
      for (let i = 0; i < audio.length; i++) audio[i] = audio[i]! * 0.72 / peak
      const sample = new BasicSample(`${tone} ${root} ${layer}`, rate, root, 0, SampleTypes.monoSample, loopStart, loopEnd)
      sample.setAudioData(audio, rate)
      bank.addSamples(sample)
      const zone = instrument.createZone(sample)
      zone.keyRange = { min, max }
      zone.velRange = velocity
      onProgress({ tone, completed: ++completed, total, stage: 'samples' })
    }
  }
  bank.addInstruments(instrument)
  const preset = new BasicPreset(bank)
  // Program zero preserves the existing bank priority contract for all voices.
  preset.name = label
  preset.createZone(instrument)
  bank.addPresets(preset)
  bank.soundBankInfo.name = `M3N Generated ${tone}`
  bank.soundBankInfo.comment = 'Procedural multisamples; 6-semitone zones, three velocity layers.'
  onProgress({ tone, completed: total, total, stage: 'packing' })
  bank.flush()
  return bank.writeSF2()
}
