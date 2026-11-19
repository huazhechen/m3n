import { shapeGlissandi, type GlissandoStyle } from './performance-transitions.js'
export type { GlissandoStyle } from './performance-transitions.js'
import { unfoldScorePerformance } from './notation/performance-order.js'
import { parseM3NGrace, parseM3NGroupPitches } from './notation/m3n-groups.js'
import { resolveScorePitches, resolveScoreTrillPitches } from './notation/score-rules.js'
import { scoreEventIds } from './score-event-ids.js'
import { m3nPitch } from './m3n-direct.js'
import type { ScoreDocument, ScoreEvent } from './notation/score-document.js'

/** Positions and durations are quarter-note beats, independent of audio devices. */
export type PerformanceNote = { start: number; end: number; pitch: number; channel: number; velocity: number; pitchBends?: Array<{ beat: number; pitch: number; duration?: number }>; expression?: Array<{ beat: number; value: number }>; volume?: Array<{ beat: number; value: number }>; transition?: boolean }
export type PerformanceElement = { start: number; end: number; xmlId: string; rendition: number; voice: string; orderIndex?: number }
export type PerformanceTempo = { beat: number; qpm: number }
export type PerformanceMeter = { beat: number; count: number; unit: number }
export type ScorePerformance = {
  notes: PerformanceNote[]
  elements: PerformanceElement[]
  tempos: PerformanceTempo[]
  meters: PerformanceMeter[]
  beats: number
}

const natural: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
const alterations: Record<string, number> = { s: 1, ss: 2, x: 2, f: -1, ff: -2, n: 0, '': 0 }

function midiPitch(value: string) {
  const [letter, octave, accidental = ''] = value.split(':')
  const pitch = 12 * (Number(octave) + 1) + (natural[letter!] ?? NaN) + (alterations[accidental] ?? NaN)
  if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) throw new Error(`音高超出 MIDI 范围：${value}`)
  return pitch
}

function gracePitch(token: string, event: ScoreEvent) {
  const value = m3nPitch(token, event.key)
  return midiPitch(`${value.pname}:${value.oct + event.octaveShift}:${value.accidGes ?? value.accid}`)
}

/** Compile the domain's itinerary once. No XML, third-party music engine or DOM. */
export function compileScorePerformance(document: ScoreDocument, options: { glissandoStyle?: GlissandoStyle } = {}): ScorePerformance {
  if (!Number.isFinite(document.tempo) || document.tempo <= 0) throw new Error('播放速度必须为正数。')
  const unfolded = unfoldScorePerformance(document)
  const ids = scoreEventIds(unfolded)
  const writtenIds = scoreEventIds(document)
  const tieTargets = new Map<string, string>()
  for (const part of document.parts.values()) for (const staff of ['melody', 'bass'] as const) {
    const events = part[staff].flatMap(measure => measure.events)
    events.forEach((event, index) => { const next = events[index + 1]; if (next) tieTargets.set(writtenIds.get(event)!, writtenIds.get(next)!) })
  }
  const result: ScorePerformance = {
    notes: [], elements: [], tempos: [{ beat: 0, qpm: document.tempo }],
    meters: [{ beat: 0, count: document.meterCount, unit: document.meterUnit }], beats: 0,
  }
  const meterFor = (settings: Pick<ScoreEvent, 'meterCount' | 'meterUnit'>) => {
    const count = settings.meterCount ?? document.meterCount, unit = settings.meterUnit ?? document.meterUnit
    if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(Math.log2(unit))) throw new Error('播放拍号无效。')
    return { count, unit }
  }
  const applySettings = (settings: Pick<ScoreEvent, 'tempo' | 'meterCount' | 'meterUnit'>, beat: number) => {
    const tempo = settings.tempo ?? document.tempo
    if (!Number.isFinite(tempo) || tempo <= 0) throw new Error('播放速度必须为正数。')
    const meter = meterFor(settings)
    if (result.tempos.at(-1)!.qpm !== tempo) result.tempos.push({ beat, qpm: tempo })
    if (result.meters.at(-1)!.count !== meter.count || result.meters.at(-1)!.unit !== meter.unit) result.meters.push({ beat, ...meter })
  }
  const trills = new Map<PerformanceNote, { start: number; upper: number }>()
  let partStart = 0
  for (const [partName, part] of unfolded.parts) {
    const pitches = { melody: resolveScorePitches(part.melody), bass: resolveScorePitches(part.bass) }
    const trillPitches = { melody: resolveScoreTrillPitches(part.melody), bass: resolveScoreTrillPitches(part.bass) }
    const pendingTies = { melody: new Map<number, { note: PerformanceNote; target: string | undefined }>(), bass: new Map<number, { note: PerformanceNote; target: string | undefined }>() }
    const pendingSlides = { melody: undefined, bass: undefined } as Record<'melody' | 'bass', { note: PerformanceNote; target: string | undefined } | undefined>
    let measureStart = partStart
    for (let index = 0; index < Math.max(part.melody.length, part.bass.length); index++) {
      let measureEnd = measureStart
      for (const staff of ['melody', 'bass'] as const) {
        const measure = part[staff][index]
        if (!measure) continue
        let cursor = measureStart
        if (measure.multiRest) {
          if (staff === 'melody' && measure.multiRestState) applySettings(measure.multiRestState, cursor)
          const meter = measure.multiRestState ? meterFor(measure.multiRestState) : result.meters.at(-1)!
          cursor += measure.multiRest * meter.count * 4 / meter.unit
          pendingTies[staff].clear()
          pendingSlides[staff] = undefined
        }
        for (const event of measure.events) {
          if (!Number.isFinite(event.beats) || event.beats <= 0) throw new Error('播放音符时值必须为正数。')
          if (staff === 'melody') applySettings(event, cursor)
          const id = ids.get(event)!
          const rendition = Number(/-rend(\d+)$/.exec(id)?.[1] ?? 1)
          const xmlId = id.replace(/-rend\d+$/, '')
          result.elements.push({ start: cursor, end: cursor + event.beats, xmlId, rendition, voice: `${partName}:${staff}`,
            ...(measure.orderIndex === undefined ? {} : { orderIndex: measure.orderIndex }) })
          const resolved = pitches[staff].get(event) ?? []
          const channel = staff === 'melody' ? 0 : 1
          const previous = pendingTies[staff]
          const next = new Map<number, { note: PerformanceNote; target: string | undefined }>()
          const addNote = (token: string, slot: number, start: number, end: number, outgoing: boolean) => {
            if (token === '0') return
            const pitch = midiPitch(resolved[slot]!)
            const markTrill = (note: PerformanceNote) => {
              if (event.postfixes.includes('tr') && !trills.has(note)) {
                trills.set(note, { start, upper: midiPitch(trillPitches[staff].get(event)![slot]!) })
              }
            }
            const tied = previous.get(pitch)
            if (tied && tied.target === xmlId && Math.abs(tied.note.end - cursor) < 1e-7 && (event.kind !== 'tuplet' || slot === 0)) tied.note.end = end
            else {
              const slide = pendingSlides[staff]
              let note: PerformanceNote
              if (slide && slide.target === xmlId && event.kind === 'note' && !event.postfixes.includes('tr') && Math.abs(slide.note.end - start) < 1e-7) {
                note = slide.note
                note.pitchBends ??= [{ beat: note.start, pitch: note.pitch }]
                note.pitchBends.push({ beat: start, pitch, ...(options.glissandoStyle === 'target-duration' ? { duration: end - start } : {}) })
                note.end = end
              } else {
                note = { start, end, pitch, channel, velocity: 90 }
                result.notes.push(note)
              }
              if (event.postfixes.includes('gliss') && event.kind === 'note' && !event.tie && !event.postfixes.includes('tr')) {
                pendingSlides[staff] = { note, target: tieTargets.get(xmlId) }
              } else pendingSlides[staff] = undefined
              markTrill(note)
              if (outgoing) next.set(pitch, { note, target: tieTargets.get(xmlId) })
              return
            }
            markTrill(tied.note)
            if (outgoing) next.set(pitch, { note: tied.note, target: tieTargets.get(xmlId) })
          }
          if (event.kind !== 'rest') {
            // Preserve the old renderer's on-beat grace convention: short
            // acciaccaturas steal 1/16 quarter beat, appoggiaturas half the host.
            const graces = event.postfixes.flatMap(mark => {
              const grace = parseM3NGrace(mark)
              return grace ? [{ ...grace, pitches: (parseM3NGroupPitches(grace.pitchSource) ?? []).filter(pitch => pitch !== '0') }] : []
            })
            const hostBeats = event.kind === 'tuplet' ? event.beats / event.pitches.length : event.beats
            const requested = graces.map(grace => grace.kind === 'ap' ? hostBeats / 2 : grace.pitches.length / 16)
            const total = requested.reduce((sum, value) => sum + value, 0)
            const scale = total > hostBeats / 2 ? hostBeats / (2 * total) : 1
            let onset = cursor
            graces.forEach((grace, group) => {
              const duration = requested[group]! * scale / Math.max(1, grace.pitches.length)
              for (const token of grace.pitches) {
                result.notes.push({ start: onset, end: onset + duration, pitch: gracePitch(token, event), channel, velocity: 90 })
                onset += duration
              }
            })
            if (event.kind === 'tuplet') {
              event.pitches.forEach((token, slot) => addNote(token, slot, slot === 0 ? onset : cursor + slot * hostBeats, cursor + (slot + 1) * hostBeats, event.tie && slot === (event.tieFromTupletIndex ?? event.pitches.length - 1)))
            } else event.pitches.forEach((token, slot) => {
              const spread = event.postfixes.includes('arp') ? Math.min(slot / 16, (cursor + event.beats - onset) / 2) : 0
              addNote(token, slot, onset + spread, cursor + event.beats, event.tie)
            })
          }
          if (event.kind === 'rest') pendingSlides[staff] = undefined
          pendingTies[staff] = next
          cursor += event.beats
        }
        measureEnd = Math.max(measureEnd, cursor)
      }
      measureStart = measureEnd
    }
    partStart = measureStart
  }
  // Expand after tie merging so a trill continues over the entire tied sustain.
  // Use roughly 32nd-note attacks, starting and ending on the principal pitch.
  result.notes = result.notes.flatMap(note => {
    const trill = trills.get(note)
    if (!trill) return [note]
    const duration = note.end - trill.start
    const count = Math.max(3, Math.round(duration * 8) | 1)
    const notes: PerformanceNote[] = note.start < trill.start ? [{ ...note, end: trill.start }] : []
    for (let index = 0; index < count; index++) {
      notes.push({ ...note, pitch: index % 2 ? trill.upper : note.pitch,
        start: trill.start + duration * index / count,
        end: index === count - 1 ? note.end : trill.start + duration * (index + 1) / count })
    }
    return notes
  })
  result.notes = shapeGlissandi(result, options.glissandoStyle ?? 'short-level')
  // Pitch bends and expression affect a whole MIDI channel. Reserve independent channels so
  // a melody slide cannot bend the bass, a chord, or another sustained note.
  const slideChannels = new Map<number, number>()
  for (const note of result.notes.filter(note => note.pitchBends || note.transition).sort((a, b) => a.start - b.start)) {
    const channel = Array.from({ length: 14 }, (_, index) => index + 2).find(channel => channel !== 9 && (slideChannels.get(channel) ?? 0) <= note.start)
    if (channel === undefined) throw new Error('同时滑音的声部数量超出 MIDI 通道上限。')
    note.channel = channel
    slideChannels.set(channel, note.end)
  }
  result.beats = partStart
  result.notes.sort((a, b) => a.start - b.start || a.channel - b.channel || a.pitch - b.pitch)
  result.elements.sort((a, b) => a.start - b.start)
  return result
}
