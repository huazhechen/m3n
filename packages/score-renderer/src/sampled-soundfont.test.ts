import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { BasicSoundBank, SoundBankLoader, SpessaSynthProcessor } from 'spessasynth_core'

const samples = { piano: 40, harmonica: 16, guitar: 10, violin: 28, flute: 18 }
test.each(Object.entries(samples))('FluidR3 %s keeps compressed samples, loops and a Program 0 preset', async (tone, count) => {
  await BasicSoundBank.isSF3DecoderReady
  const data = readFileSync(new URL(`../vendor/soundfonts/FluidR3-${tone}-q3.sf3`, import.meta.url))
  const bank = SoundBankLoader.fromArrayBuffer(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
  expect(bank.presets).toHaveLength(1)
  expect(bank.presets[0].program).toBe(0)
  expect(bank.samples).toHaveLength(count)
  for (const sample of bank.samples) {
    expect(sample.isCompressed).toBe(true)
    const audio = sample.getAudioData()
    expect(audio.every(Number.isFinite)).toBe(true)
    expect(audio.some(value => value !== 0)).toBe(true)
    expect(sample.loopStart).toBeGreaterThanOrEqual(0)
    expect(sample.loopEnd).toBeGreaterThan(sample.loopStart)
    expect(sample.loopEnd).toBeLessThanOrEqual(audio.length)
  }
  const synth = new SpessaSynthProcessor(44100, { effectsEnabled: false })
  await synth.processorInitialized
  try {
    synth.soundBankManager.addSoundBank(bank, tone)
    synth.noteOn(0, 60, 127)
    const l = new Float32Array(128), r = new Float32Array(128)
    for (let i = 0; i < 500; i++) synth.process(l, r)
    synth.noteOff(0, 60)
    for (let i = 0; i < 7000; i++) { l.fill(0); r.fill(0); synth.process(l, r) }
    expect(synth.voiceCount).toBe(0)
  } finally { synth.destroySynthProcessor() }
})
