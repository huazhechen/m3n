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

/** Standard MIDI file, format 1: conductor followed by melody/bass channels. */
export function writePerformanceMidi(performance: ScorePerformance): ArrayBuffer {
  const conductor: MidiEvent[] = []
  for (const point of performance.tempos) {
    const micros = Math.round(60_000_000 / point.qpm)
    if (micros < 1 || micros > 0xffffff) throw new Error('速度超出 MIDI 范围。')
    conductor.push({ tick: performanceTick(point.beat), priority: 0, data: [0xff, 0x51, 3, ...integer(micros, 3)] })
  }
  for (const point of performance.meters) conductor.push({ tick: performanceTick(point.beat), priority: 1, data: [0xff, 0x58, 4, point.count, Math.log2(point.unit), 24, 8] })
  const end = performanceTick(performance.beats)
  const tracks = [track(conductor, end)]
  const channels = [...new Set([0, ...performance.notes.map(note => note.channel)])]
  for (const channel of channels) {
    const events: MidiEvent[] = [{ tick: 0, priority: 0, data: [0xc0 | channel, 0] }]
    for (const note of performance.notes.filter(note => note.channel === channel)) {
      const start = performanceTick(note.start), finish = performanceTick(note.end)
      // Retain a short release gap; never turn a very short note off before on.
      const off = note.transition ? Math.max(start + 1, finish) : Math.max(start + 1, finish - Math.min(8, Math.floor((finish - start) / 4)))
      // Each shaped transition has a private channel, so these fades affect
      // only its own voice. Send zero expression before note-on to hide attack.
      if (note.transition || note.pitchBends) events.push({ tick: start, priority: 0, data: [0xb0 | channel, 120, 0] })
      events.push({ tick: start, priority: 1, data: [0xb0 | channel, 11, note.expression?.[0]?.value ?? 127] })
      for (let index = 1; index < (note.expression?.length ?? 0); index++) {
        const from = note.expression![index - 1]!, to = note.expression![index]!
        if (from.value === to.value) continue
        const steps = Math.max(1, Math.ceil((to.beat - from.beat) * 256))
        for (let step = 1; step <= steps; step++) events.push({
          tick: performanceTick(from.beat + (to.beat - from.beat) * step / steps), priority: 1,
          data: [0xb0 | channel, 11, Math.round(from.value + (to.value - from.value) * step / steps)],
        })
      }
      if (note.pitchBends?.length) {
        const range = Math.max(2, ...note.pitchBends.map(point => Math.ceil(Math.abs(point.pitch - note.pitch))))
        // RPN 0 sets pitch-bend sensitivity in semitones, then deselects RPN.
        for (const [controller, value] of [[101, 0], [100, 0], [6, range], [38, 0], [101, 127], [100, 127]]) {
          events.push({ tick: start, priority: 1, data: [0xb0 | channel, controller!, value!] })
        }
        const bend = (beat: number, pitch: number) => {
          const value = Math.max(0, Math.min(16383, Math.round(8192 + (pitch - note.pitch) / range * 8192)))
          events.push({ tick: performanceTick(beat), priority: 1, data: [0xe0 | channel, value & 127, value >> 7] })
        }
        bend(note.start, note.pitch)
        for (let index = 1; index < note.pitchBends.length; index++) {
          const from = note.pitchBends[index - 1]!, to = note.pitchBends[index]!
          const steps = Math.max(1, Math.ceil((to.beat - from.beat) * 64))
          for (let step = 1; step <= steps; step++) bend(from.beat + (to.beat - from.beat) * step / steps, from.pitch + (to.pitch - from.pitch) * step / steps)
        }
        events.push({ tick: finish, priority: 1, data: [0xe0 | channel, 0, 64] })
      }
      events.push({ tick: start, priority: 2, data: [0x90 | channel, note.pitch, note.velocity] }, { tick: off, priority: 1, data: [0x90 | channel, note.pitch, 0] })
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
