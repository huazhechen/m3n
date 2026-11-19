import { SoundBankLoader, SpessaSynthProcessor } from 'spessasynth_core'
import { expect, test } from 'vitest'
import { createSyntheticSoundFont } from './synthetic-soundfont'

test('default synthetic tone covers the keyboard and renders sustained notes and releases', async () => {
  const bytes = createSyntheticSoundFont()
  expect(bytes.byteLength).toBeLessThan(800_000)
  const bank = SoundBankLoader.fromArrayBuffer(bytes)
  expect(bank.presets).toHaveLength(1)
  expect(bank.samples.length).toBeGreaterThan(0)
  expect(bank.presets[0].program).toBe(0)
  for (let key = 21; key <= 108; key++) {
    for (const velocity of [1, 64, 127]) {
      expect(bank.presets[0].getVoiceParameters(key, velocity).length).toBeGreaterThan(0)
    }
  }
  const synth = new SpessaSynthProcessor(44100, { effectsEnabled: false })
  await synth.processorInitialized
  synth.soundBankManager.addSoundBank(bank, 'piano')
  try {
    const left = new Float32Array(128)
    const right = new Float32Array(128)
    for (const key of [21, 60, 108]) {
      for (const velocity of [32, 96, 127]) {
        synth.stopAllChannels(true)
        synth.noteOn(0, key, velocity)
        let energy = 0
        // Eight seconds traverses even the longest bass attack and loop.
        for (let block = 0; block < 2757; block++) {
          left.fill(0)
          right.fill(0)
          synth.process(left, right)
          expect(left.every(Number.isFinite) && right.every(Number.isFinite)).toBe(true)
          for (const value of left) energy += value * value
        }
        expect(energy).toBeGreaterThan(0.0001)
        synth.noteOff(0, key)
        for (let block = 0; block < 1034; block++) {
          left.fill(0)
          right.fill(0)
          synth.process(left, right)
        }
        expect(synth.voiceCount).toBe(0)
      }
    }
  } finally {
    synth.destroySynthProcessor()
  }
}, 30_000)

test('FM electric piano has a brighter attack, a fixed bright timbre, exact tuning and seamless loops', () => {
  const bank = SoundBankLoader.fromArrayBuffer(createSyntheticSoundFont())
  expect(bank.samples).toHaveLength(8)
  for (let key = 0; key <= 127; key++) for (const velocity of [1, 79, 80, 127]) {
    expect(bank.presets[0]!.getVoiceParameters(key, velocity)).toHaveLength(1)
  }
  for (const sample of bank.samples) {
    const period = (sample.loopEnd - sample.loopStart) / 2
    expect(sample.sampleRate / period).toBeCloseTo(440 * 2 ** ((sample.originalKey - 69) / 12), 6)
    const audio = sample.getAudioData()
    expect(audio.slice(sample.loopStart, sample.loopStart + period)).toEqual(audio.slice(sample.loopStart + period, sample.loopEnd))
    expect(audio.slice(sample.loopStart - period, sample.loopStart)).toEqual(audio.slice(sample.loopStart, sample.loopStart + period))
    expect(audio.slice(0, sample.loopEnd).every(value => Number.isFinite(value) && Math.abs(value) <= 0.901)).toBe(true)
  }
  const brightness = (sample: typeof bank.samples[number], start: number) => {
    const period = (sample.loopEnd - sample.loopStart) / 2
    const audio = sample.getAudioData().slice(start, start + period)
    const energy = (harmonic: number) => {
      const amplitude = audio.reduce((sum, value, i) => sum + value * Math.sin(2 * Math.PI * harmonic * i / period), 0)
      return amplitude * amplitude
    }
    return Array.from({ length: 20 }, (_, i) => energy(i + 2)).reduce((sum, value) => sum + value, 0) / energy(1)
  }
  const voice = bank.samples.find(sample => sample.originalKey === 69)!
  // Sustain retains audible low harmonics rather than fading to a near sine.
  const sustainBrightness = brightness(voice, voice.loopStart)
  expect(sustainBrightness).toBeGreaterThan(0.04)
  expect(sustainBrightness).toBeLessThan(0.15)
  expect(brightness(voice, 0)).toBeGreaterThan(sustainBrightness * 2)
  // Every velocity resolves to the same sample: no soft/strong layer switching.
  const instrument = bank.instruments[0]!
  expect(instrument.zones.every(zone => zone.velRange.min === 0 && zone.velRange.max === 127)).toBe(true)
})

test('generated FM banks are cached without sharing transferable buffers', () => {
  const first = createSyntheticSoundFont(), second = createSyntheticSoundFont()
  expect(first).not.toBe(second)
  expect(new Uint8Array(first)).toEqual(new Uint8Array(second))
})
