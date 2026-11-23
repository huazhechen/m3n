import {
  incomingMeasureKeys, m3nPitch, parseKey, scoreEventIds, parseM3NGrace, parseM3NGroupPitches,
  type ScoreDocument, type ScoreEvent, type ScoreEventLyric, type ScoreMeasure,
} from '@m3n/notation'
import { staffDisplayScore } from './display-score.js'

export type StaffPitch = { key: string; accidental: string; explicit: boolean }
export type StaffEvent = {
  id: string; event: ScoreEvent; pitches: StaffPitch[]; lyrics: ScoreEventLyric[]
  children?: StaffEvent[]; onset: number; beats: number
  key: string; previousKey: string
  graces?: Array<{ pitches: StaffPitch[]; duration: number; slash: boolean }>
}
export type StaffMeasure = {
  id: string; number: number; melody: StaffEvent[]; bass: StaffEvent[]
  source: ScoreMeasure; key: string; previousKey: string
  meterCount: number; meterUnit: number; tempo: number; showTempo: boolean; showMeter: boolean
  force: boolean; section: boolean; fragment: boolean; lastFragment: boolean
}
export type StaffDocument = {
  score: ScoreDocument; measures: StaffMeasure[]; hasBass: boolean
}
export function staffKey(raw: string) {
  const { tonic, mode } = parseKey(raw)
  const natural: Record<string, number> = { C: 0, D: 2, E: 4, F: -1, G: 1, A: 3, B: 5 }
  const offsets: Record<string, number> = { m: -3, dor: -2, phr: -4, lyd: 1, mix: -1, loc: -5 }
  const fifths = (natural[tonic[0]!] ?? 0) + (tonic.endsWith('#') ? 7 : tonic.endsWith('b') ? -7 : 0) + (offsets[mode] ?? 0)
  return ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'][fifths + 7] ?? 'C'
}
const accidentalNames: Record<string, string> = { s: '#', f: 'b', ss: '##', x: '##', ff: 'bb', n: 'n' }
/** A typed display projection. No source parsing, serialization, or input mutation. */
export function projectStaffDocument(input: ScoreDocument, transpose = 0, includeBass = true): StaffDocument {
  const display = staffDisplayScore(input)
  const ids = scoreEventIds(display.score)
  const incomingTies = new Set<ScoreEvent>()
  for (const part of display.score.parts.values()) for (const lane of ['melody', 'bass'] as const) {
    let tied = false
    for (const event of part[lane].flatMap(measure => measure.events)) {
      if (tied) incomingTies.add(event)
      tied = event.tie
    }
  }
  const measures: StaffMeasure[] = []
  const hasBass = includeBass && [...display.score.parts.values()].some(p => p.bass.some(m => m.events.length || m.multiRest))
  let number = 0, previousMeter = `${input.meterCount}/${input.meterUnit}`, previousTempo = input.tempo, previousBreak = false
  // The display projection already handles keyed visits. Transposition keeps
  // diatonic spelling in the target key, including explicit alterations.
  const naturals = [0, 2, 4, 5, 7, 9, 11]
  const letters = ['c', 'd', 'e', 'f', 'g', 'a', 'b']
  const offset: Record<string, number> = { '#': 1, '##': 2, b: -1, bb: -2, n: 0, '': 0 }
  const targetKeys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
  const transposeKey = (key: string) => {
    if (!transpose) return staffKey(key)
    const raw = staffKey(key), i = letters.indexOf(raw[0]!.toLowerCase())
    return targetKeys[((naturals[i]! + (offset[raw.slice(1)] ?? 0) + transpose) % 12 + 12) % 12]!
  }
  for (const [partIndex, part] of [...display.score.parts.values()].entries()) {
    const incoming = incomingMeasureKeys(display.score, part.melody)
    let previousKey = input.key
    let count = Math.max(part.melody.length, hasBass ? part.bass.length : 0)
    while (count > 1 && !part.melody[count - 1]?.events.length && !part.melody[count - 1]?.multiRest && !part.melody[count - 1]?.interlude && !part.bass[count - 1]?.events.length && !part.bass[count - 1]?.multiRest) count--
    for (let index = 0; index < count; index++) {
      const source = part.melody[index] ?? { events: [] }
      const first = source.events[0]
      const state = source.multiRestState
      const key = first?.key ?? state?.key ?? previousKey
      const predecessors = [...incoming.get(source) ?? []]
      const entryKey = predecessors.find(k => k !== key) ?? predecessors[0] ?? previousKey
      const meterCount = first?.meterCount ?? state?.meterCount ?? input.meterCount
      const meterUnit = first?.meterUnit ?? state?.meterUnit ?? input.meterUnit
      const meter = `${meterCount}/${meterUnit}`
      const tempo = first?.tempo ?? state?.tempo ?? previousTempo
      const lane = (measure: ScoreMeasure | undefined): StaffEvent[] => {
        const accidentals = new Map<string, string>()
        let onset = 0, activeKey = entryKey
        const pitch = (token: string, event: ScoreEvent): StaffPitch => {
          const value = m3nPitch(token, event.key)
          const oct = value.oct + (display.octaveOffsets.get(event) ?? 0)
          const identity = `${value.pname}/${oct}`
          const explicit = Boolean(value.accid)
          if (explicit) accidentals.set(identity, accidentalNames[value.accid] ?? '')
          let accidental = accidentals.get(identity) ?? accidentalNames[value.accidGes ?? ''] ?? ''
          let letter = value.pname, octave = oct
          if (transpose) {
            const semitone = naturals[letters.indexOf(letter)]! + (offset[accidental] ?? 0) + oct * 12 + transpose
            const target = transposeKey(event.key)
            const preferFlat = target.includes('b')
            const spelling = (preferFlat ? ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'] : ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'])[((semitone % 12) + 12) % 12]!
            letter = spelling[0]!
            accidental = spelling.slice(1)
            octave = Math.floor(semitone / 12)
          }
          return { key: `${letter}${accidental === 'n' ? '' : accidental}/${octave}`, accidental, explicit }
        }
        return (measure?.events ?? []).map(event => {
          if (event.key !== activeKey) accidentals.clear()
          const previous = activeKey
          activeKey = event.key
          const id = ids.get(event)!
          const lyrics = display.lyricsByEvent.get(event) ?? []
          const graces = event.postfixes.flatMap(value => {
            const grace = parseM3NGrace(value)
            return grace ? [{ pitches: (parseM3NGroupPitches(grace.pitchSource) ?? []).map(p => pitch(p, event)), duration: 2 ** (grace.depth + 2), slash: grace.kind === 'ac' }] : []
          })
          const item: StaffEvent = { id, event, pitches: event.pitches.map(p => pitch(p, event)), lyrics, onset, beats: event.beats, key: transposeKey(event.key), previousKey: transposeKey(previous), graces }
          if (event.kind === 'tuplet' && event.tuplet) {
            const sung = new Map<number, number>()
            const byVerse = new Map<number, ScoreEventLyric[]>()
            for (const lyric of lyrics) byVerse.set(lyric.verseIndex, [...byVerse.get(lyric.verseIndex) ?? [], lyric])
            item.children = event.pitches.map((token, i) => {
              const tied = (i === 0 && incomingTies.has(event)) || !!event.tupletTies?.includes(i - 1)
              const syllables = token === '0' ? [] : [...byVerse].flatMap(([verse, row]) => {
                const index = sung.get(verse) ?? 0, lyric = row[index]
                if (!lyric || lyric.forceTiedTarget !== tied) return []
                sung.set(verse, index + 1)
                return [lyric]
              })
              return { ...item, id: `${id}-n${i + 1}`, event: { ...event, kind: token === '0' ? 'rest' : 'note', postfixes: [], pitches: [token] }, pitches: [item.pitches[i]!], lyrics: syllables, graces: i === 0 ? graces : [], onset: onset + i * event.beats / event.pitches.length, beats: event.tuplet!.unitBeats }
            })
          }
          onset += event.beats
          return item
        })
      }
      measures.push({
        id: `m3n-measure-${partIndex + 1}-${index + 1}`, number: source.interlude ? number : ++number,
        melody: lane(source), bass: hasBass ? lane(part.bass[index]) : [], source,
        key: transposeKey(key), previousKey: transposeKey(entryKey), meterCount, meterUnit, tempo,
        showTempo: (!measures.length && (input.hasExplicitTempo || Boolean(input.order))) || tempo !== previousTempo,
        showMeter: !measures.length || meter !== previousMeter,
        force: (partIndex > 0 && index === 0) || previousBreak || Boolean(source.breakBefore || first?.sectionLabel),
        section: Boolean(first?.sectionLabel), fragment: false, lastFragment: true,
      })
      number += (source.multiRest ?? 1) - 1
      previousKey = source.events.at(-1)?.key ?? key
      previousMeter = `${source.events.at(-1)?.meterCount ?? meterCount}/${source.events.at(-1)?.meterUnit ?? meterUnit}`; previousTempo = source.events.at(-1)?.tempo ?? tempo; previousBreak = Boolean(source.breakAfter)
    }
  }
  return { score: display.score, measures, hasBass }
}

/** Split only at common event boundaries. Tuplets remain atomic and retain IDs. */
export function splitStaffMeasure(measure: StaffMeasure, maximumBeats: number): StaffMeasure[] {
  const end = Math.max(...[measure.melody, measure.bass].map(lane => lane.reduce((n, e) => n + e.beats, 0)))
  const boundaries = (lane: StaffEvent[]) => new Set([0, ...lane.map(e => Math.round((e.onset + e.beats) * 1e6) / 1e6)])
  const a = boundaries(measure.melody), b = boundaries(measure.bass)
  const safe = [...a].filter(t => t > 0 && t < end && (!measure.bass.length || b.has(t))).sort((x, y) => x - y)
  const cuts = [0]
  while (end - cuts.at(-1)! > maximumBeats) {
    const start = cuts.at(-1)!
    const candidates = safe.filter(t => t > start && t <= start + maximumBeats)
    const preferred = candidates.filter(t => Math.abs(t - Math.round(t)) < 1e-6)
    const cut = preferred.at(-1) ?? candidates.at(-1) ?? safe.find(t => t > start)
    if (cut === undefined) break
    cuts.push(cut)
  }
  cuts.push(end)
  if (cuts.length === 2) return [measure]
  return cuts.slice(0, -1).map((start, i) => ({
    ...measure, id: `${measure.id}-fragment-${i + 1}`, fragment: true, lastFragment: i === cuts.length - 2,
    force: i === 0 && measure.force, section: i === 0 && measure.section,
    showTempo: i === 0 && measure.showTempo, showMeter: i === 0 && measure.showMeter,
    melody: measure.melody.filter(e => e.onset >= start && e.onset < cuts[i + 1]!).map(e => ({ ...e, onset: e.onset - start })),
    bass: measure.bass.filter(e => e.onset >= start && e.onset < cuts[i + 1]!).map(e => ({ ...e, onset: e.onset - start })),
    source: { ...measure.source, left: i === 0 ? measure.source.left : 'invis', right: i === cuts.length - 2 ? measure.source.right : 'invis' },
  }))
}
