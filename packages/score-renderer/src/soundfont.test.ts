import { readFileSync } from 'node:fs'
import { BasicSoundBank, SoundBankLoader, SpessaSynthProcessor } from 'spessasynth_core'
import { expect, test } from 'vitest'
import { createSyntheticSoundFont } from './synthetic-soundfont'

test.each(['Piano', 'Harmonica', 'Synthetic'])('%s covers the keyboard and renders sustained notes and releases', async (tone) => {
  await BasicSoundBank.isSF3DecoderReady
  const bytes = tone === 'Synthetic' ? Buffer.from(createSyntheticSoundFont())
    : readFileSync(new URL(`../vendor/soundfonts/FluidR3_GM-${tone}.sf3`, import.meta.url))
  expect(bytes.length).toBeLessThan(tone === 'Piano' ? 1_400_000 : tone === 'Synthetic' ? 800_000 : 400_000)
  const bank = SoundBankLoader.fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  expect(bank.presets).toHaveLength(1)
  expect(bank.samples.length).toBeGreaterThan(0)
  expect(bank.presets[0].program).toBe(0)
  if (tone === 'Piano') { expect(bytes.length).toBe(1_365_672); expect(bank.samples).toHaveLength(40) }
  if (tone === 'Synthetic') expect(bytes.length).toBeLessThan(800_000)
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

test('FM electric piano has a brighter attack, velocity layers, exact tuning and seamless loops', () => {
  const bank = SoundBankLoader.fromArrayBuffer(createSyntheticSoundFont())
  expect(bank.samples).toHaveLength(16)
  for (let key = 0; key <= 127; key++) for (const velocity of [1, 79, 80, 127]) {
    expect(bank.presets[0]!.getVoiceParameters(key, velocity)).toHaveLength(1)
  }
  for (const sample of bank.samples) {
    const period = (sample.loopEnd - sample.loopStart) / 2
    expect(sample.sampleRate / period).toBeCloseTo(440 * 2 ** ((sample.originalKey - 69) / 12), 6)
    const audio = sample.getAudioData()
    expect(audio.slice(sample.loopStart, sample.loopStart + period)).toEqual(audio.slice(sample.loopStart + period, sample.loopEnd))
    expect(audio.slice(sample.loopStart - period, sample.loopStart)).toEqual(audio.slice(sample.loopStart, sample.loopStart + period))
    expect(audio.slice(0, sample.loopEnd).every(value => Number.isFinite(value) && Math.abs(value) <= 0.551)).toBe(true)
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
  const soft = bank.samples.find(sample => sample.originalKey === 69 && sample.name.includes('soft'))!
  const hard = bank.samples.find(sample => sample.originalKey === 69 && sample.name.includes('hard'))!
  expect(brightness(soft, 0)).toBeGreaterThan(brightness(soft, soft.loopStart) * 10)
  expect(brightness(hard, 0)).toBeGreaterThan(brightness(soft, 0))
})

test('generated FM banks are cached without sharing transferable buffers', () => {
  const first = createSyntheticSoundFont(), second = createSyntheticSoundFont()
  expect(first).not.toBe(second)
  expect(new Uint8Array(first)).toEqual(new Uint8Array(second))
})
