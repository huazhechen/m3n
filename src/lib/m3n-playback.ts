import { parseM3NDocument, type DirectEvent } from './m3n-direct'
import { m3nChord } from './m3n-harmony'

export type AccompanimentNote = { startBeats: number; durationBeats: number; midi: number; velocity: number }
export type TempoChange = { startBeats: number; tempo: number; sourceStart?: number; ramp?: boolean }

function usesArpeggioPattern(meterCount: number, meterUnit: number) {
  return (meterUnit === 4 && [2, 3, 4].includes(meterCount)) || (meterUnit === 8 && [6, 9, 12].includes(meterCount))
}

export function buildAccompaniment(source: string): AccompanimentNote[] {
  const document = parseM3NDocument(source)
  const notes: AccompanimentNote[] = []
  let startBeats = 0
  let arpeggioIndex = 0
  const partNames = document.partOrder.length > 0 ? document.partOrder : [...document.parts.keys()]
  for (const name of partNames) {
    const part = document.parts.get(name)
    for (const measure of part?.melody ?? []) {
      for (const event of measure.events) {
        const chord = event.chordState ? m3nChord(event.chordState, event.key) : null
        if (chord) {
          const meterCount = event.meterCount ?? document.meterCount
          const meterUnit = event.meterUnit ?? document.meterUnit
          if (usesArpeggioPattern(meterCount, meterUnit)) {
            const pulse = meterUnit === 8 ? 0.5 : 1
            for (let offset = 0; offset < event.beats - 0.0001; offset += pulse) {
              const durationBeats = Math.min(pulse, event.beats - offset)
              notes.push({ startBeats: startBeats + offset, durationBeats, midi: chord.midi[arpeggioIndex % chord.midi.length] ?? chord.midi[0] ?? 48, velocity: 58 })
              arpeggioIndex += 1
            }
          } else {
            notes.push(...chord.midi.map((midi) => ({ startBeats, durationBeats: event.beats, midi, velocity: 52 })))
          }
        }
        startBeats += event.beats
      }
    }
  }
  return notes
}

export function buildTempoChanges(source: string): TempoChange[] {
  const document = parseM3NDocument(source)
  const changes: TempoChange[] = []
  const events: Array<{ event: DirectEvent; startBeats: number }> = []
  let startBeats = 0
  const partNames = document.partOrder.length > 0 ? document.partOrder : [...document.parts.keys()]
  for (const name of partNames) {
    for (const measure of document.parts.get(name)?.melody ?? []) {
      for (const event of measure.events) {
        events.push({ event, startBeats })
        startBeats += event.beats
      }
    }
  }
  let tempo = document.tempo
  for (const { event, startBeats: eventStart } of events) {
    const ramp = document.intervals.find((interval) => interval.staff === 'melody'
      && (interval.kind === 'accel' || interval.kind === 'rit')
      && interval.start !== undefined && interval.endStart !== undefined
      && event.sourceStart >= interval.start && event.sourceStart <= interval.endStart)
    const nextTempo = event.tempo ?? tempo
    if (!ramp || ramp.tempoTarget === undefined) {
      if (nextTempo !== tempo) changes.push({ startBeats: eventStart, tempo: nextTempo, sourceStart: event.sourceStart })
      tempo = nextTempo
      continue
    }
    const rampEvents = events.filter(({ event: candidate }) => candidate.sourceStart >= ramp.start! && candidate.sourceStart <= ramp.endStart!)
    const index = rampEvents.findIndex(({ event: candidate }) => candidate === event)
    const fraction = rampEvents.length <= 1 ? 1 : index / (rampEvents.length - 1)
    const rampTempo = Math.round(nextTempo + (ramp.tempoTarget - nextTempo) * fraction)
    if (rampTempo !== tempo) changes.push({ startBeats: eventStart, tempo: rampTempo, sourceStart: event.sourceStart, ramp: index > 0 })
    tempo = rampTempo
  }
  return changes
}
