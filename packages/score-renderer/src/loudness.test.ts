import { expect, test } from 'vitest'
import { SoundBankLoader, SpessaSynthProcessor } from 'spessasynth_core'
import { createInstrumentSoundFont } from './instrument-soundfont'
import { createSyntheticSoundFont } from './synthetic-soundfont'
import { PLAYBACK_TONES } from './tone-catalog'

// Exercise the real SF2 envelopes, pan law and channel gain, not just PCM peaks.
// Piano/guitar previously passed peak tests despite almost silent note bodies.
test.each(PLAYBACK_TONES)('$label has an audible note body and sustain at full playback volume', async ({ value: tone }) => {
  const bank = SoundBankLoader.fromArrayBuffer(tone === 'synth' ? createSyntheticSoundFont() : createInstrumentSoundFont(tone))
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
          if (t >= 0.05 && t < 1) { body += left[i]! ** 2; bodyCount++ }
          if (t >= 1 && t < 2) { sustain += left[i]! ** 2; sustainCount++ }
        }
      }
      // At least -24dBFS before the output makeup/compression (+6dB and above).
      expect(Math.sqrt(body / bodyCount), `${tone} ${key} body RMS`).toBeGreaterThan(0.063)
      expect(Math.sqrt(sustain / sustainCount), `${tone} ${key} sustain RMS`).toBeGreaterThan(0.032)
    }
  } finally { synth.destroySynthProcessor() }
})
