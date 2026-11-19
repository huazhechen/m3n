import { readFileSync } from 'node:fs'
import { BasicMIDI, BasicSoundBank, SoundBankLoader, SpessaSynthProcessor } from 'spessasynth_core'
import { parseM3NDocument } from '@m3n/notation'
import { expect, it } from 'vitest'
import { NativePlaybackScore } from './native-playback-score.js'
import { createSyntheticSoundFont } from './synthetic-soundfont.js'

it.each(['piano', 'synth'])('softens the actual target attack in the %s bank while retaining its body', async tone => {
  await BasicSoundBank.isSF3DecoderReady
  const bytes = tone === 'synth' ? Buffer.from(createSyntheticSoundFont()) : readFileSync(new URL('../vendor/soundfonts/FluidR3_GM-Piano.sf3', import.meta.url))
  const energy = async (style: 'soft' | 'overlap') => {
    const score = await NativePlaybackScore.create(parseM3NDocument('{2/4}{120qpm}\nN: (2e{gliss} 1e) 1e |||'), { glissandoStyle: style })
    const events = BasicMIDI.fromArrayBuffer(score.midi()).tracks.flatMap(track => track.events)
      .filter(event => (event.statusByte & 15) === 3 && event.statusByte < 240 && event.ticks >= 480)
    const synth = new SpessaSynthProcessor(44100, { effectsEnabled: false })
    await synth.processorInitialized
    const bank = SoundBankLoader.fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    synth.soundBankManager.addSoundBank(bank, tone)
    const left = new Float32Array(128), right = new Float32Array(128)
    let eventIndex = 0, attack = 0, body = 0
    try {
      for (let block = 0; block < 70; block++) {
        const seconds = block * 128 / 44100
        while (eventIndex < events.length && (events[eventIndex]!.ticks - 480) / 1920 <= seconds) {
          const event = events[eventIndex++]!
          synth.processMessage([event.statusByte, ...event.data])
        }
        left.fill(0); right.fill(0)
        synth.process(left, right)
        for (const value of left) {
          if (seconds < .02) attack += value * value
          if (seconds >= .1 && seconds < .15) body += value * value
        }
      }
    } finally { synth.destroySynthProcessor(); score.destroy() }
    return { attack, body }
  }
  const soft = await energy('soft'), overlap = await energy('overlap')
  expect(overlap.attack).toBeGreaterThan(0)
  expect(soft.attack).toBeLessThan(overlap.attack * .5)
  expect(soft.body).toBeGreaterThan(overlap.body * .8)
  expect(soft.body).toBeLessThan(overlap.body * 1.2)
})
