import { expect, test } from 'vitest'
import { SoundBankLoader, SpessaSynthProcessor } from 'spessasynth_core'
import { createInstrumentSoundFont } from './instrument-soundfont'
import { PLAYBACK_TONES, type ToneGenerationProgress } from './tone-catalog'

const tones = PLAYBACK_TONES.filter(tone => tone.value !== 'synth')
test.each(tones)('$label generates a playable bank with complete zones, stable loops and finite releases', async ({ value: tone }) => {
  if (tone === 'synth') return
  const updates: ToneGenerationProgress[] = []
  const bank = SoundBankLoader.fromArrayBuffer(createInstrumentSoundFont(tone, progress => updates.push(progress)))
  expect(updates.at(-1)).toEqual({ tone, completed: 48, total: 48, stage: 'packing' })
  expect(updates.slice(0, 48).map(value => value.completed)).toEqual(Array.from({ length: 48 }, (_, i) => i + 1))
  expect(bank.samples).toHaveLength(48)
  expect(bank.presets).toHaveLength(1)
  expect(bank.presets[0].program).toBe(0)
  for (let key = 0; key <= 127; key++) for (const velocity of [1, 54, 55, 94, 95, 127]) {
    expect(bank.presets[0].getVoiceParameters(key, velocity)).toHaveLength(1)
  }
  for (const sample of bank.samples) {
    const audio = sample.getAudioData()
    expect(audio.every(value => Number.isFinite(value) && Math.abs(value) <= 0.721)).toBe(true)
    const loopPeriod = (sample.loopEnd - sample.loopStart) / 2
    const period = Math.max(16, Math.round(32000 / (440 * 2 ** ((sample.originalKey - 69) / 12))))
    expect(audio.subarray(sample.loopStart - loopPeriod, sample.loopStart).every((value, i) => value === audio[sample.loopStart + i])).toBe(true)
    expect(audio.subarray(sample.loopStart, sample.loopStart + loopPeriod).every((value, i) => value === audio[sample.loopStart + loopPeriod + i])).toBe(true)
    const tuningCents = 1200 * Math.log2(sample.sampleRate / period / (440 * 2 ** ((sample.originalKey - 69) / 12)))
    expect(Math.abs(tuningCents)).toBeLessThan(0.1)
  }
  const synth = new SpessaSynthProcessor(44100, { effectsEnabled: false })
  await synth.processorInitialized
  synth.soundBankManager.addSoundBank(bank, tone)
  const left = new Float32Array(128), right = new Float32Array(128)
  try {
    for (const key of [36, 69, 96]) for (const velocity of [32, 110]) {
      synth.stopAllChannels(true); synth.noteOn(0, key, velocity)
      let energy = 0
      // Enter the loop even for the long piano samples.
      for (let block = 0; block < 1100; block++) {
        left.fill(0); right.fill(0); synth.process(left, right)
        expect(left.every(Number.isFinite) && right.every(Number.isFinite)).toBe(true)
        energy += left.reduce((sum, value) => sum + value * value, 0)
      }
      expect(energy).toBeGreaterThan(0.001)
      synth.noteOff(0, key)
      for (let block = 0; block < 700; block++) { left.fill(0); right.fill(0); synth.process(left, right) }
      expect(synth.voiceCount).toBe(0)
    }
  } finally { synth.destroySynthProcessor() }
}, 30_000)
