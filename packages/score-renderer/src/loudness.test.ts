import { expect, test } from 'vitest'
import { SoundBankLoader, SpessaSynthProcessor } from 'spessasynth_core'
import { readFileSync } from 'node:fs'
import { BasicSoundBank } from 'spessasynth_core'
import { createSyntheticSoundFont } from './synthetic-soundfont'
import { PLAYBACK_TONES } from './tone-catalog'
import { PLAYBACK_TONE_GAIN } from './tone-levels'

// Exercise the real SF2 envelopes, pan law and channel gain, not just PCM peaks.
// Piano/guitar previously passed peak tests despite almost silent note bodies.
test.each(PLAYBACK_TONES)('$label has an audible note body and sustain at full playback volume', async ({ value: tone }) => {
  await BasicSoundBank.isSF3DecoderReady
  const data = tone === 'synth' ? createSyntheticSoundFont() : readFileSync(new URL(`../vendor/soundfonts/FluidR3-${tone}-q3.sf3`, import.meta.url))
  const bank = SoundBankLoader.fromArrayBuffer(data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
  const synth = new SpessaSynthProcessor(44100, { effectsEnabled: false })
  await synth.processorInitialized
  synth.soundBankManager.addSoundBank(bank, tone)
  synth.controllerChange(0, 7, 127)
  try {
    for (const key of [48, 60, 72]) {
      synth.stopAllChannels(true); synth.noteOn(0, key, 127)
      const left = new Float32Array(128), right = new Float32Array(128)
      let body = 0, sustain = 0, bodyCount = 0, sustainCount = 0
      for (let block = 0; block < 1034; block++) {
        left.fill(0); right.fill(0); synth.process(left, right)
        for (let i = 0; i < left.length; i++) {
          const t = (block * 128 + i) / 44100
          if (t >= 0.05 && t < 1) { body += (left[i]! ** 2 + right[i]! ** 2) / 2; bodyCount++ }
          if (t >= 1 && t < 2) { sustain += (left[i]! ** 2 + right[i]! ** 2) / 2; sustainCount++ }
        }
      }
      // Fixed trims precede mastering; plucked instruments retain natural decay.
      // Do not force their second-second level to match a wind/bow sustain.
      expect(Math.sqrt(body / bodyCount) * PLAYBACK_TONE_GAIN[tone], `${tone} ${key} body RMS`).toBeGreaterThan(0.063)
      expect(Math.sqrt(sustain / sustainCount) * PLAYBACK_TONE_GAIN[tone], `${tone} ${key} sustain RMS`).toBeGreaterThan(tone === 'guitar' || tone === 'piano' ? 0.004 : 0.032)
    }
  } finally { synth.destroySynthProcessor() }
})
