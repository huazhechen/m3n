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
