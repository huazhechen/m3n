import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { BasicMIDI } from 'spessasynth_core'
import { parseM3NDocument, compileScorePerformance } from '@m3n/notation'
import { NativePlaybackScore } from './native-playback-score.js'
import { buildMetronomeBeats } from './metronome.js'

const prepare = (source: string) => NativePlaybackScore.create(parseM3NDocument(source))

describe('native MIDI and playback index', () => {
  it('writes a standard format-1 MIDI with independent voices and all silent measures', async () => {
    const score = await prepare('{2/4}{120qpm}\nN: {rest=2} | 1 2 | {rest=2} |||\nB: {rest=2} | 1d^ | {rest=2} |||')
    const midi = BasicMIDI.fromArrayBuffer(score.midi())
    expect(midi.timeDivision).toBe(960)
    expect(midi.duration).toBeCloseTo(5)
    expect(midi.tracks.flatMap(track => track.events).filter(event => (event.statusByte & 240) === 144 && event.data[1]! > 0).map(event => [event.statusByte & 15, event.ticks / 960, event.data[0]])).toEqual([[0, 4, 60], [0, 5, 62], [1, 4, 48]])
    expect(buildMetronomeBeats(midi).filter(beat => beat.accent).map(beat => beat.time)).toEqual([0, 1, 2, 3, 4, 5])
  })
  it('uses MIDI-quantized tempo changes for source lookup and simultaneous highlighting', async () => {
    const score = await prepare('{2/4}{120qpm}\nN: 1 2 | {60qpm}3 4 |||\nB: 1d^ | 5d^ |||')
    expect(score.timeForElement('m3n-e-4')).toBe(1000)
    expect(score.elementsAtTime(1200).map(element => element.xmlId)).toEqual(['m3n-e-4', 'm3n-e-6'])
    expect(score.elementsAtTime(2000).map(element => element.xmlId)).toEqual(['m3n-e-6', 'm3n-e-5'])
    expect(score.elementsAtTime(-1)).toEqual([])
    expect(score.elementsAtTime(Infinity)).toEqual([])
    expect(score.elementsAtTime(3000)).toEqual([])
    expect(score.timeForElement('missing')).toBe(-1)
  })
  it('indexes alternative occurrences and keeps the compact event identity', async () => {
    const score = await prepare('{2/4}{300qpm}\nN: ||: 1 2 | 3 4 :||\nNs[2]: 2: (5 6) 7 |')
    expect(score.elementsAtTime(1250)).toContainEqual({ xmlId: 'm3n-e-a1-1', rendition: 2 })
    expect(score.elementsAtTime(900)).toContainEqual({ xmlId: 'm3n-e-1', rendition: 2 })
    expect(score.timeForElement('m3n-e-1-rend2')).toBe(800)
  })
  it('returns independent MIDI buffers and rejects operations after disposal', async () => {
    const score = await prepare('{2/4}\nN: 1 2 |||')
    const first = score.midi(), second = score.midi()
    expect(first).not.toBe(second)
    expect(first).toEqual(second)
    new Uint8Array(first).fill(0)
    expect(new Uint8Array(score.midi())[0]).toBe(77)
    score.destroy(); score.destroy()
    expect(() => score.midi()).toThrow('释放')
    expect(() => score.elementsAtTime(0)).toThrow('释放')
  })
  const folder = new URL('../../../src/scores/', import.meta.url)
  it.each(readdirSync(folder).filter(file => file.endsWith('.m3n')))('compiles every source event and independently decodes valid MIDI for %s', async file => {
    const document = parseM3NDocument(readFileSync(new URL(file, folder), 'utf8'))
    const performance = compileScorePerformance(document)
    const score = await NativePlaybackScore.create(document)
    const midi = BasicMIDI.fromArrayBuffer(score.midi())
    const decoded = midi.tracks.flatMap(track => track.events.filter(event => (event.statusByte & 240) === 144 && event.data[1]! > 0).map(event => ({ pitch: event.data[0], tick: event.ticks, channel: event.statusByte & 15 }))).sort((a, b) => a.tick - b.tick || a.channel - b.channel || a.pitch! - b.pitch!)
    expect(decoded).toEqual(performance.notes.map(note => ({ pitch: note.pitch, tick: Math.round(note.start * 960), channel: note.channel })).sort((a, b) => a.tick - b.tick || a.channel - b.channel || a.pitch - b.pitch))
    expect(midi.duration).toBeGreaterThan(0)
    expect(performance.elements.length).toBeGreaterThanOrEqual([...document.parts.values()].flatMap(part => part.melody.flatMap(measure => measure.events)).length)
    score.destroy()
  })
})
