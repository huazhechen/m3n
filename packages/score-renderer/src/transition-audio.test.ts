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

it.each(['piano', 'synth'])('lifts only the sliding interval, leaving both sides unchanged without a second attack in the %s bank', async tone => {
  await BasicSoundBank.isSF3DecoderReady
  const bytes = tone === 'synth' ? Buffer.from(createSyntheticSoundFont()) : readFileSync(new URL('../vendor/soundfonts/FluidR3_GM-Piano.sf3', import.meta.url))
  const energy = async (glissandoStyle: 'short-smooth' | 'short-level' | 'short-strong') => {
    const score = await NativePlaybackScore.create(parseM3NDocument('{2/4}{120qpm}\nN: (2e{gliss} 1e) 1e |||'), { glissandoStyle })
    const events = BasicMIDI.fromArrayBuffer(score.midi()).tracks.flatMap(track => track.events)
      .filter(event => (event.statusByte & 15) === 2 && event.statusByte < 240)
    expect(events.filter(event => (event.statusByte & 240) === 144 && event.data[1]! > 0)).toHaveLength(1)
    expect(events.filter(event => (event.statusByte & 240) === 176 && event.data[0] === 11).every(event => event.data[1] === 127)).toBe(true)
    const bends = events.filter(event => (event.statusByte & 240) === 224)
    expect(Array.from(bends.at(-1)!.data)).toEqual([0, 0])
    expect(bends.at(-1)!.ticks).toBe(480)
    const synth = new SpessaSynthProcessor(44100, { effectsEnabled: false })
    await synth.processorInitialized
    synth.soundBankManager.addSoundBank(SoundBankLoader.fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), tone)
    const left = new Float32Array(128), right = new Float32Array(128)
    let eventIndex = 0, before = 0, during = 0, after = 0
    try {
      for (let block = 0; block < 145; block++) {
        const seconds = block * 128 / 44100
        while (eventIndex < events.length && events[eventIndex]!.ticks / 1920 <= seconds) {
          const event = events[eventIndex++]!
          synth.processMessage([event.statusByte, ...event.data])
        }
        left.fill(0); right.fill(0); synth.process(left, right)
        for (const value of left) {
          if (seconds >= .1 && seconds < .15) before += value * value
          if (seconds >= .22 && seconds < .25) during += value * value
          if (seconds >= .3 && seconds < .4) after += value * value
        }
      }
    } finally { synth.destroySynthProcessor(); score.destroy() }
    return { before, during, after }
  }
  const smooth = await energy('short-smooth'), level = await energy('short-level')
  expect(smooth.before).toBeGreaterThan(0)
  expect(level.before).toBeCloseTo(smooth.before, 5)
  expect(level.during).toBeGreaterThan(smooth.during * 1.25)
  expect(level.after / smooth.after).toBeCloseTo(1, 1)
  const strong = await energy('short-strong')
  expect(strong.during).toBeGreaterThan(level.during * 1.1)
  expect(strong.after / smooth.after).toBeCloseTo(1, 1)
})
