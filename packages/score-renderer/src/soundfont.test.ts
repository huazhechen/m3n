import { readFileSync } from 'node:fs'
import { BasicSoundBank, SoundBankLoader, SpessaSynthProcessor } from 'spessasynth_core'
import { expect, test } from 'vitest'
import { createSyntheticSoundFont } from './synthetic-soundfont'

test.each(['Piano', 'Harmonica', 'Synthetic'])('%s covers the keyboard and renders sustained notes and releases', async (tone) => {
  await BasicSoundBank.isSF3DecoderReady
  const bytes = tone === 'Synthetic' ? Buffer.from(createSyntheticSoundFont())
    : readFileSync(new URL(`../vendor/soundfonts/FluidR3_GM-${tone}.sf3`, import.meta.url))
  expect(bytes.length).toBeLessThan(tone === 'Piano' ? 1_400_000 : 400_000)
  const bank = SoundBankLoader.fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  expect(bank.presets).toHaveLength(1)
  expect(bank.samples.length).toBeGreaterThan(0)
  expect(bank.presets[0].program).toBe(0)
  if (tone === 'Piano') { expect(bytes.length).toBe(1_365_672); expect(bank.samples).toHaveLength(40) }
  if (tone === 'Synthetic') expect(bytes.length).toBeLessThan(4096)
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

test('additive tone keeps exact pitch, controlled harmonics and no high-register alias partials', () => {
  const bank = SoundBankLoader.fromArrayBuffer(createSyntheticSoundFont())
  expect(bank.samples).toHaveLength(4)
  const limits = [[83, 6], [107, 4], [119, 2], [127, 1]] as const
  bank.samples.forEach((sample, index) => {
    const audio = sample.getAudioData().slice(sample.loopStart, sample.loopEnd)
    expect(sample.originalKey).toBe(45)
    expect(sample.sampleRate / audio.length).toBe(110)
    expect(Math.max(...audio.map(Math.abs))).toBeLessThanOrEqual(0.551)
    const amplitude = (harmonic: number) => Math.hypot(
      audio.reduce((sum, value, i) => sum + value * Math.sin(2 * Math.PI * harmonic * i / audio.length), 0),
      audio.reduce((sum, value, i) => sum + value * Math.cos(2 * Math.PI * harmonic * i / audio.length), 0),
    ) * 2 / audio.length
    const [topKey, partials] = limits[index]!
    expect(440 * 2 ** ((topKey - 69) / 12) * partials).toBeLessThan(22050)
    if (partials > 1) expect(amplitude(2) / amplitude(1)).toBeCloseTo(0.28, 3)
    expect(amplitude(partials + 1)).toBeLessThan(0.0001)
  })
})
