import { compileScorePerformance, parseM3NDocument } from '@m3n/notation'
import { readFileSync, readdirSync } from 'node:fs'
import { BasicMIDI } from 'spessasynth_core'
import { describe, expect, it } from 'vitest'
import { buildMetronomeBeats } from './metronome.js'
import { NativePlaybackScore } from './native-playback-score.js'

const prepare = (source: string) => NativePlaybackScore.create(parseM3NDocument(source))

describe('native MIDI and playback index', () => {
  it('indexes tuplet subdivisions at MIDI boundaries through tempo changes and ties', async () => {
    const score = await prepare('{2/4}{120qpm}\nN: ([1 2 3:2]) {60qpm}([4~ 4 5:2]) |||')
    expect(score.elementsAtTime(166)[0]).toMatchObject({ tupletSlot: 0 })
    expect(score.elementsAtTime(167)[0]).toMatchObject({ tupletSlot: 1 })
    expect(score.elementsAtTime(334)[0]).toMatchObject({ tupletSlot: 2 })
    expect(score.elementsAtTime(500)[0]).toMatchObject({ tupletSlot: 0 })
    expect(score.elementsAtTime(834)[0]).toMatchObject({ tupletSlot: 1 })
    expect(score.elementsAtTime(1167)[0]).toMatchObject({ tupletSlot: 2 })
    expect(score.nextElementAtTime(100)).toMatchObject({ tupletSlot: 1 })
    expect(score.resumeTimeAt(100)).toBeCloseTo(1000 / 6)
    expect(score.resumeTimeAt(600)).toBeCloseTo(500 + 2000 / 3)
    expect(score.resumeTimeAt(900)).toBeCloseTo(500 + 2000 / 3)
    score.destroy()
  })
  it('resumes after interrupted notes and ties, keeps rests and restarts at the end', async () => {
    const score = await prepare('{4/4}{120qpm}\nN: 1 0 2 3 |||')
    expect(score.resumeTimeAt(250)).toBe(500)
    expect(score.resumeTimeAt(750)).toBe(750)
    expect(score.resumeTimeAt(1000)).toBe(1000)
    expect(score.resumeTimeAt(1250)).toBe(1500)
    expect(score.resumeTimeAt(1750)).toBe(0)
    const tied = await prepare('{4/4}{120qpm}\nN: 1~ 1 2 3 |||')
    expect(tied.resumeTimeAt(250)).toBe(1000)
    expect(tied.resumeTimeAt(750)).toBe(1000)
  })
  it('writes a standard format-1 MIDI with independent voices and all silent measures', async () => {
    const score = await prepare('{2/4}{120qpm}\nN: {rest=2} | 1 2 | {rest=2} |||\nB: {rest=2} | 1d^ | {rest=2} |||')
    const midi = BasicMIDI.fromArrayBuffer(score.midi())
    expect(midi.timeDivision).toBe(960)
    expect(midi.duration).toBeCloseTo(5)
    expect(midi.tracks.flatMap(track => track.events).filter(event => (event.statusByte & 240) === 144 && event.data[1]! > 0).map(event => [event.statusByte & 15, event.ticks / 960, event.data[0]])).toEqual([[0, 4, 60], [0, 5, 62], [1, 4, 48]])
    expect(buildMetronomeBeats(midi).filter(beat => beat.accent).map(beat => beat.time)).toEqual([0, 1, 2, 3, 4, 5])
  })
  it('starts the metronome grid at the first full bar after an opening pickup', async () => {
    const document = parseM3NDocument(readFileSync(new URL('../../../src/scores/auld_lang_syne_01.m3n', import.meta.url), 'utf8'))
    const score = await NativePlaybackScore.create(document)
    const beats = buildMetronomeBeats(BasicMIDI.fromArrayBuffer(score.midi()))
    expect(beats.slice(0, 4).map(beat => beat.time)).toEqual([
      expect.closeTo(0.5 * 60 / 92), expect.closeTo(1.5 * 60 / 92),
      expect.closeTo(2.5 * 60 / 92), expect.closeTo(3.5 * 60 / 92),
    ])
    expect(beats[0]?.accent).toBe(true)
    score.destroy()
  })
  it('writes default note velocity and channel volume while preserving note-off messages', async () => {
    const score = await prepare('{4/4}\nN: {ppp}1{ac(7d)} {fff}2{tr} {cresc}3 4{/} |||\nB: 1d^^ |||')
    const midi = BasicMIDI.fromArrayBuffer(score.midi())
    const events = midi.tracks.flatMap(track => track.events)
    const notes = events.filter(event => (event.statusByte & 0xf0) === 0x90)
    expect(notes.filter(event => event.data[1]! > 0).every(event => event.data[1] === 64)).toBe(true)
    expect(notes.filter(event => event.data[1] === 0)).toHaveLength(notes.filter(event => event.data[1]! > 0).length)
    for (const channel of [0, 1]) {
      expect(events.some(event => event.ticks === 0 && event.statusByte === (0xb0 | channel) && event.data[0] === 7 && event.data[1] === 100)).toBe(true)
    }
    score.destroy()
  })
  it('encodes audible trill attacks while keeping one source highlight for the host note', async () => {
    const score = await prepare('{2/4}{120qpm}\nN: 3{tr} 4 |||')
    const midi = BasicMIDI.fromArrayBuffer(score.midi())
    const attacks = midi.tracks.flatMap(track => track.events).filter(event => (event.statusByte & 240) === 144 && event.data[1]! > 0)
    expect(attacks.map(event => event.data[0])).toEqual([64, 65, 64, 65, 64, 65, 64, 65, 64, 65])
    expect(new Set(attacks.map(event => event.ticks)).size).toBe(10)
    expect(midi.duration).toBeCloseTo(1)
    expect(score.elementsAtTime(0)).toEqual(score.elementsAtTime(499))
    expect(score.timeForElement('m3n-e-2')).toBe(500)
    expect(score.elementsAtTime(500)[0]!.xmlId).toBe('m3n-e-2')
    score.destroy()
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
  it('keeps a leading rest active at zero and distinguishes repeated order entries', async () => {
    const score = await prepare('{2/4}{120qpm}{order=A,B,A}\n===A\nN: ||: 0 1 :||\n===B\nN: 2 3 |||')
    const opening = score.elementsAtTime(0)
    expect(opening).toHaveLength(1)
    expect(opening[0]).toMatchObject({ orderIndex: 0 })
    expect(score.elementsAtTime(499)).toEqual(opening)
    expect(score.elementsAtTime(1000)[0]).toMatchObject({ xmlId: opening[0]!.xmlId, orderIndex: 0 })
    expect(score.elementsAtTime(2000)[0]).toMatchObject({ orderIndex: 1 })
    expect(score.elementsAtTime(3000)[0]).toMatchObject({ xmlId: opening[0]!.xmlId, orderIndex: 2 })
    score.destroy()
  })
  it('locates the next melody cue through rests, tempo changes and repeated occurrences', async () => {
    const score = await prepare('{2/4}{120qpm}{order=A,B,A}\n===A\nN: 0 1 ||\nB: (1d 2d) 3d |\n===B\nN: {60qpm}2 3 |||')
    expect(score.nextElementAtTime(0)).toEqual(score.elementsAtTime(0)[0])
    // A bass onset at 250 ms must not take the melody cue away from the next 1.
    expect(score.nextElementAtTime(100)).toEqual(score.elementsAtTime(500).find(element => element.xmlId === 'm3n-e-2'))
    expect(score.nextElementAtTime(501)).toEqual(score.elementsAtTime(1000).find(element => element.orderIndex === 1))
    expect(score.nextElementAtTime(2001)).toMatchObject({ orderIndex: 2, rendition: 2 })
    expect(score.nextElementAtTime(4000)).toBeUndefined()
    expect(score.nextElementAtTime(-1)).toBeUndefined()
    expect(score.nextElementAtTime(Infinity)).toBeUndefined()
    score.destroy()
    expect(() => score.nextElementAtTime(0)).toThrow('释放')
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
  it.each([
    ['huang_hun_01.m3n', 65, 187.5, 188.5, 188],
    ['qing_niao_01.m3n', 78, 359.5, 362, 360],
    ['san_bu_01.m3n', 67, 331.75, 336, 332],
  ] as const)('keeps the written third-pass tie in %s instead of reattacking its continuation', (file, pitch, start, end, continuation) => {
    const document = parseM3NDocument(readFileSync(new URL(file, folder), 'utf8'))
    const performance = compileScorePerformance(document)
    expect(performance.notes).toContainEqual({ pitch, start, end, channel: 0, velocity: 64 })
    expect(performance.notes.some(note => note.pitch === pitch && note.start === continuation)).toBe(false)
    expect(performance.elements.some(element => element.start === continuation && element.rendition === 3)).toBe(true)
  })
  it('sustains Annie’s closing 2 and cross-bar 7 without reattacking their continuations', () => {
    const performance = compileScorePerformance(parseM3NDocument(readFileSync(new URL('annie_01.m3n', folder), 'utf8')))
    for (const [pitch, start, end, continuation] of [[74, 137.75, 139, 138], [71, 139.75, 144, 140]]) {
      expect(performance.notes).toContainEqual({ pitch, start, end, channel: 0, velocity: 64 })
      expect(performance.notes.some(note => note.pitch === pitch && note.start === continuation)).toBe(false)
      expect(performance.elements.some(element => element.start === continuation)).toBe(true)
    }
  })
  it('plays all twelve written beats of the final Besame Mucho tied chain', () => {
    const performance = compileScorePerformance(parseM3NDocument(readFileSync(new URL('besame_mucho_01.m3n', folder), 'utf8')))
    expect(performance.beats).toBe(320)
    expect(performance.notes.at(-1)!.pitch).toBe(72)
    expect(performance.notes.at(-1)!.end).toBe(320)
    expect(performance.elements.slice(-3).map(element => [element.start, element.end])).toEqual([[308, 312], [312, 316], [316, 320]])
  })
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
