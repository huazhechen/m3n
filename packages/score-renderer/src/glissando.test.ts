import { parseM3NDocument } from '@m3n/notation'
import { BasicMIDI } from 'spessasynth_core'
import { expect, it } from 'vitest'
import { NativePlaybackScore } from './native-playback-score.js'

it('writes continuous pitch bends with one attack for the pair and a new attack for the final target', async () => {
  const score = await NativePlaybackScore.create(parseM3NDocument('{2/4}{120qpm}\nN: (2e{gliss} 1e) 1e |||\nB: 1d^ |||'), { glissandoStyle: 'continuous' })
  const midi = BasicMIDI.fromArrayBuffer(score.midi())
  const events = midi.tracks.flatMap(track => track.events)
  const attacks = events.filter(event => (event.statusByte & 240) === 144 && event.data[1]! > 0)
  expect(attacks.map(event => [event.statusByte & 15, event.ticks, event.data[0]])).toEqual([[0, 960, 72], [1, 0, 48], [2, 0, 74]])
  const bends = events.filter(event => (event.statusByte & 240) === 224)
  expect(bends.every(event => (event.statusByte & 15) === 2)).toBe(true)
  const value = (event: typeof bends[number]) => event.data[0]! + event.data[1]! * 128
  expect(value(bends[0]!)).toBe(8192)
  const ramp = bends.filter(event => event.ticks <= 480)
  expect(ramp).toHaveLength(33)
  expect(value(ramp.at(-1)!)).toBe(0)
  ramp.slice(1).forEach((event, index) => expect(value(event)).toBeLessThan(value(ramp[index]!)))
  expect(value(bends.at(-1)!)).toBe(8192)
  expect(bends.at(-1)!.ticks).toBe(960)
  expect(events.filter(event => event.statusByte === 178 && event.data[0] === 6).map(event => event.data[1])).toEqual([2])
  expect(score.timeForElement('m3n-e-2')).toBe(250)
  expect(score.elementsAtTime(250).map(element => element.xmlId)).toContain('m3n-e-2')
  expect(midi.duration).toBe(1)
  score.destroy()
})
it('sets sufficient bend range for wide slides and resets before reusing the channel', async () => {
  const score = await NativePlaybackScore.create(parseM3NDocument('{4/4}\nN: 1{gliss} 1e 1e{gliss} 1 |||'), { glissandoStyle: 'continuous' })
  const events = BasicMIDI.fromArrayBuffer(score.midi()).tracks.flatMap(track => track.events)
  const attacks = events.filter(event => event.statusByte === 146 && event.data[1]! > 0)
  expect(attacks.map(event => event.ticks)).toEqual([0, 1920])
  expect(events.filter(event => event.statusByte === 178 && event.data[0] === 6).map(event => event.data[1])).toEqual([12, 12])
  const boundary = events.filter(event => event.ticks === 1920 && event.statusByte === 226)
  expect(boundary.every(event => event.data[0] === 0 && event.data[1] === 64)).toBe(true)
  score.destroy()
})

it('uses the target slot to slide and reaches its pitch just before the next repeated target attack', async () => {
  const score = await NativePlaybackScore.create(parseM3NDocument('{2/4}{120qpm}\nN: (2e{gliss} 1e) 1e |||'), { glissandoStyle: 'target-duration' })
  const events = BasicMIDI.fromArrayBuffer(score.midi()).tracks.flatMap(track => track.events)
  const attacks = events.filter(event => (event.statusByte & 240) === 144 && event.data[1]! > 0)
  expect(attacks.map(event => [event.statusByte & 15, event.ticks, event.data[0]])).toEqual([[0, 960, 72], [2, 0, 74]])
  const bends = events.filter(event => event.statusByte === 226)
  expect(bends.filter(event => event.ticks <= 480).every(event => event.data[0] === 0 && event.data[1] === 64)).toBe(true)
  expect(bends.some(event => event.ticks > 480 && event.ticks < 960)).toBe(true)
  expect(bends.at(-1)!.ticks).toBe(960)
  expect(Array.from(bends.at(-1)!.data)).toEqual([0, 0])
  const off = events.find(event => event.statusByte === 146 && event.data[1] === 0)!
  expect(off.ticks).toBe(960)
  expect(events.filter(event => event.statusByte === 178 && event.data[0] === 11).every(event => event.data[1] === 127)).toBe(true)
  expect(events.filter(event => event.statusByte === 178 && event.data[0] === 7).every(event => event.data[1] === 100)).toBe(true)
  expect(score.timeForElement('m3n-e-2')).toBe(250)
  expect(score.timeForElement('m3n-e-3')).toBe(500)
  score.destroy()
})

it.each([{ start: 1, end: .25 }, { start: 0, end: 1 }, { start: .5, end: .5 }, { start: 1, end: 0 }] as const)('exports Hermite window %j with a single attack and unchanged gain', async glissandoWindow => {
  const score = await NativePlaybackScore.create(parseM3NDocument('{2/4}{120qpm}\nN: (2e{gliss} 1e) 1e |||'), { glissandoStyle: 'hermite', glissandoWindow })
  const events = BasicMIDI.fromArrayBuffer(score.midi()).tracks.flatMap(track => track.events)
  const attacks = events.filter(event => (event.statusByte & 240) === 144 && event.data[1]! > 0)
  expect(attacks.map(event => [event.statusByte & 15, event.ticks])).toEqual([[0, 960], [2, 0]])
  const bends = events.filter(event => event.statusByte === 226)
  const start = 480 * glissandoWindow.start, end = 480 + 480 * glissandoWindow.end
  expect(bends.filter(event => event.ticks < start).every(event => event.data[0] === 0 && event.data[1] === 64)).toBe(true)
  expect(bends.at(-1)!.ticks).toBe(end)
  expect(Array.from(bends.at(-1)!.data)).toEqual([0, 0])
  if (start === end) expect(bends).toHaveLength(2)
  else expect(bends.some(event => event.ticks > start && event.ticks < end)).toBe(true)
  expect(events.filter(event => event.statusByte === 178 && event.data[0] === 11).every(event => event.data[1] === 127)).toBe(true)
  expect(events.filter(event => event.statusByte === 178 && event.data[0] === 7).every(event => event.data[1] === 100)).toBe(true)
  expect(score.timeForElement('m3n-e-2')).toBe(250)
  score.destroy()
})
