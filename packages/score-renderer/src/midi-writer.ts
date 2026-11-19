import type { ScorePerformance } from '@m3n/notation'

/** 960 PPQ represents supported dyadic rhythms and common tuplets accurately. */
export const MIDI_PPQ = 960
export const performanceTick = (beat: number) => Math.round(beat * MIDI_PPQ)
type MidiEvent = { tick: number; priority: number; data: number[] }
const integer = (value: number, bytes: number) => Array.from({ length: bytes }, (_, index) => Math.floor(value / 256 ** (bytes - index - 1)) % 256)
function variable(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x0fffffff) throw new Error('MIDI 时间超出范围。')
  const bytes = [value % 128]
  while ((value = Math.floor(value / 128)) > 0) bytes.unshift(value % 128 + 128)
  return bytes
}
function chunk(name: string, data: number[]) { return [...Array.from(name, char => char.charCodeAt(0)), ...integer(data.length, 4), ...data] }
function track(events: MidiEvent[], end: number) {
  const data: number[] = []
  let previous = 0
  for (const event of events.sort((a, b) => a.tick - b.tick || a.priority - b.priority)) {
    data.push(...variable(event.tick - previous), ...event.data)
    previous = event.tick
  }
  data.push(...variable(Math.max(previous, end) - previous), 0xff, 0x2f, 0)
  return chunk('MTrk', data)
}

export type MidiWriteOptions = { transpose?: number; tempoScale?: number; includeProgramChange?: boolean }

/** Standard MIDI file, format 1: conductor followed by melody/bass channels. */
export function writePerformanceMidi(performance: ScorePerformance, { transpose = 0, tempoScale = 1, includeProgramChange = true }: MidiWriteOptions = {}): ArrayBuffer {
  if (!Number.isInteger(transpose)) throw new Error('移调必须为整数半音。')
  if (!Number.isFinite(tempoScale) || tempoScale <= 0) throw new Error('速度倍率必须为正数。')
  const conductor: MidiEvent[] = []
  for (const point of performance.tempos) {
    const micros = Math.round(60_000_000 / (point.qpm * tempoScale))
    if (micros < 1 || micros > 0xffffff) throw new Error('速度超出 MIDI 范围。')
    conductor.push({ tick: performanceTick(point.beat), priority: 0, data: [0xff, 0x51, 3, ...integer(micros, 3)] })
  }
  for (const point of performance.meters) conductor.push({ tick: performanceTick(point.beat), priority: 1, data: [0xff, 0x58, 4, point.count, Math.log2(point.unit), 24, 8] })
  const end = performanceTick(performance.beats)
  const tracks = [track(conductor, end)]
  const channels = [...new Set([0, ...performance.notes.map(note => note.channel)])]
  for (const channel of channels) {
    const events: MidiEvent[] = [
      ...(includeProgramChange ? [{ tick: 0, priority: 0, data: [0xc0 | channel, 0] }] : []),
      // Full channel volume: the synth's default 100 adds another attenuation.
      { tick: 0, priority: 0, data: [0xb0 | channel, 7, 127] },
    ]
    for (const note of performance.notes.filter(note => note.channel === channel)) {
      const pitch = note.pitch + transpose
      if (pitch < 0 || pitch > 127) throw new Error('移调后的音高超出 MIDI 范围（0–127）。')
      const start = performanceTick(note.start), finish = performanceTick(note.end)
      // Retain a short release gap; never turn a very short note off before on.
      const off = Math.max(start + 1, finish - Math.min(8, Math.floor((finish - start) / 4)))
      events.push({ tick: start, priority: 2, data: [0x90 | channel, pitch, note.velocity] }, { tick: off, priority: 1, data: [0x90 | channel, pitch, 0] })
    }
    // Sequencers commonly ignore an end-of-track meta event when calculating
    // audible duration. A silent channel message preserves trailing rests,
    // including documents consisting entirely of rests.
    events.push({ tick: end, priority: 3, data: [0xb0 | channel, 123, 0] })
    tracks.push(track(events, end))
  }
  const bytes = [...chunk('MThd', [...integer(1, 2), ...integer(tracks.length, 2), ...integer(MIDI_PPQ, 2)]), ...tracks.flat()]
  return Uint8Array.from(bytes).buffer
}
