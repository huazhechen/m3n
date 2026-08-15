import { parse, toContentString, type TNode } from 'txml/txml'
import { m3nPitch } from './m3n-direct.js'
import { parseKey } from './notation/m3n-primitives.js'
import { parseM3NGrace, parseM3NGroupPitches } from './notation/m3n-groups.js'
import type { ScoreDocument, ScoreEvent } from './notation/score-document.js'

/** Staff row used by the jianpu renderer. */
export type JianpuScoreStaff = 'melody' | 'bass'

export type JianpuScoreNote = {
  staff: JianpuScoreStaff
  /** Quarter-note time of the sounding note (ties are merged into one note). */
  start: number
  length: number
  /** MIDI pitch number. */
  pitch: number
  xmlId: string
  sourceStart: number
  sourceEnd: number
  staccato: boolean
  trill: boolean
  accent: boolean
  dynamic?: string
}

export type JianpuScoreTuplet = {
  staff: JianpuScoreStaff
  start: number
  length: number
  num: number
  numbase: number
  xmlId: string
  children: Array<{ pitch: number; start: number; xmlId: string }>
}

export type JianpuScoreGrace = {
  staff: JianpuScoreStaff
  start: number
  pitch: number
  kind: 'ac' | 'ap'
  xmlId: string
}

/** An absorbed tied note that shares the DOM block of its tie origin. */
export type JianpuScoreContinuation = {
  staff: JianpuScoreStaff
  start: number
  xmlId: string
}

export type JianpuScoreMeasure = {
  partIndex: number
  index: number
  number: number
  start: number
  length: number
  meterCount: number
  meterUnit: number
  xmlId: string
  ending?: string
  repeatStart: boolean
  repeatEnd: boolean
  repeatCount?: number
  navigation: Array<'segno' | 'ds' | 'dc' | 'fine'>
  sectionLabel?: string
  multiRest?: number
}

export type JianpuScoreLyric = {
  staff: JianpuScoreStaff
  /** Quarter-note time of the note this syllable is attached to. */
  start: number
  verse: number
  n: string
  passes?: number[]
  text: string
  underlined: boolean
  extender: boolean
  kind: 'text' | 'placeholder' | 'extender'
  wordpos?: 'i' | 'm' | 't'
  xmlId: string
}

export type JianpuScoreKey = { start: number; key: number }
export type JianpuScoreMeter = { start: number; numerator: number; denominator: number }
export type JianpuScoreTempo = { start: number; qpm: number }

export type JianpuScoreData = {
  title: string
  subtitle: string
  singer: string
  composer: string
  lyricist: string
  arranger: string
  key: string
  tempo: number
  meterCount: number
  meterUnit: number
  hasBass: boolean
  notes: JianpuScoreNote[]
  measures: JianpuScoreMeasure[]
  /** Layout keys consumed by JianpuRender (tonic pitch class). */
  keySignatures: JianpuScoreKey[]
  /** Per-measure layout meters so pickups and incomplete measures render correctly. */
  layoutTimeSignatures: JianpuScoreMeter[]
  /** Display meters shown at the staff head and at changes. */
  timeSignatures: JianpuScoreMeter[]
  tempos: JianpuScoreTempo[]
  lyrics: JianpuScoreLyric[]
  tuplets: JianpuScoreTuplet[]
  graces: JianpuScoreGrace[]
  /** Tied continuations whose xmlId must highlight the block containing them. */
  continuations: JianpuScoreContinuation[]
}

type MeiVerseData = {
  verse: number
  n: string
  passes?: number[]
  text: string
  underlined: boolean
  extender: boolean
  kind: 'text' | 'placeholder' | 'extender'
  wordpos?: 'i' | 'm' | 't'
}

const LETTER_TO_MIDI: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }

/** Converts an M3N pitch token in the given key to a MIDI pitch number. */
export function m3nPitchToMidi(pitch: string, key: string, octaveShift = 0) {
  const { pname, oct, accid } = m3nPitch(pitch, key)
  let midi = 12 * (oct + 1) + (LETTER_TO_MIDI[pname] ?? 0)
  midi += octaveShift * 12
  if (accid === 's' || accid === 'x') midi += accid === 'x' ? 2 : 1
  else if (accid === 'f' || accid === 'ff') midi -= accid === 'ff' ? 2 : 1
  return midi
}

/** Converts an M3N key name to the tonic pitch class used by JianpuRender. */
export function jianpuKeyNumber(key: string) {
  const { tonic } = parseKey(key)
  let pitchClass = LETTER_TO_MIDI[tonic.charAt(0).toLowerCase()] ?? 0
  if (tonic.endsWith('#')) pitchClass += 1
  else if (tonic.endsWith('b')) pitchClass -= 1
  return (pitchClass + 12) % 12
}

function measureEventBeats(events: readonly ScoreEvent[]) {
  return events.reduce((sum, event) => sum + event.beats, 0)
}

function trimTrailingEmptyMeasures(part: { melody: Array<{ events: ScoreEvent[]; multiRest?: number; breakBefore?: boolean; breakAfter?: boolean }>; bass: Array<{ events: ScoreEvent[]; multiRest?: number }> }) {
  while (part.melody.length > 1 && part.melody.at(-1)?.events.length === 0 && !part.melody.at(-1)?.multiRest) {
    const trailing = part.melody.pop()
    const previous = part.melody.at(-1)
    if (previous && (trailing?.breakBefore || trailing?.breakAfter)) previous.breakAfter = true
  }
  while (part.bass.length > 1 && part.bass.at(-1)?.events.length === 0 && !part.bass.at(-1)?.multiRest) part.bass.pop()
}

function collectMeiLyrics(mei: string) {
  const result = new Map<string, MeiVerseData[]>()
  let currentId: string | undefined
  const visit = (nodes: readonly (TNode | string)[]) => {
    for (const node of nodes) {
      if (typeof node === 'string') continue
      const previousId = currentId
      if (node.tagName === 'verse') {
        const verses = result.get(currentId ?? '') ?? []
        const verseIndex = /-v(\d+)$/.exec(currentId ?? '')?.[1]
        const n = node.attributes.n ?? '1'
        const passType = node.attributes.type
        const passes = typeof passType === 'string' && passType.startsWith('m3n-passes-')
          ? passType.slice('m3n-passes-'.length).split('-').map(Number).filter(Number.isInteger)
          : undefined
        for (const child of node.children) {
          if (typeof child === 'string' || child.tagName !== 'syl') continue
          const con = child.attributes.con
          const type = child.attributes.type
          const wordpos = child.attributes.wordpos
          let text = toContentString([child]).replaceAll('\u200B', '')
          const placeholder = text.includes('\u2800')
          if (placeholder) text = ''
          const extender = con === 'u'
          verses.push({
            verse: Number(verseIndex ?? n) || 1,
            n,
            passes,
            text,
            underlined: type === 'm3n-text-underline' || (!extender && wordpos !== undefined && con === 'd'),
            extender,
            kind: placeholder ? 'placeholder' : extender ? 'extender' : 'text',
            wordpos: typeof wordpos === 'string' ? wordpos as 'i' | 'm' | 't' : undefined,
          })
        }
        if (verses.length > 0 && !result.has(currentId ?? '')) result.set(currentId ?? '', verses)
      } else {
        const elementId = typeof node.attributes['xml:id'] === 'string' ? node.attributes['xml:id'] : undefined
        if (elementId) currentId = elementId
      }
      visit(node.children)
      currentId = previousId
    }
  }
  visit(parse(mei, { decodeEntities: true, keepComments: true }))
  return result
}

type NoteAtom = {
  staff: JianpuScoreStaff
  start: number
  length: number
  pitch: number
  xmlId: string
  sourceStart: number
  sourceEnd: number
  staccato: boolean
  trill: boolean
  accent: boolean
  dynamic?: string
}

function roundedQuarter(value: number) {
  return Math.round(value * 1000) / 1000
}

/**
 * Converts a parsed M3N document into the library-agnostic jianpu model used by
 * the score renderer. Lyrics and event IDs are taken from the generated MEI so
 * jianpu and staff notation share identical assignment and source mapping.
 */
export function toJianpuScoreData(document: ScoreDocument, mei = ''): JianpuScoreData {
  const parts = [...document.parts.values()]
  const hasBass = parts.some((part) => part.bass.some((measure) => (measure?.events.length ?? 0) > 0))
  const lyricMap = mei ? collectMeiLyrics(mei) : new Map<string, MeiVerseData[]>()
  for (const part of parts) trimTrailingEmptyMeasures(part)

  let eventIndex = 0
  const assignedIds = new Map<ScoreEvent, string>()
  for (const part of parts) {
    const measureCount = Math.max(part.melody.length, hasBass ? part.bass.length : 0)
    for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
      for (const event of part.melody[measureIndex]?.events ?? []) assignedIds.set(event, `m3n-e-${++eventIndex}`)
      for (const event of part.bass[measureIndex]?.events ?? []) assignedIds.set(event, `m3n-e-${++eventIndex}`)
    }
  }

  const notes: JianpuScoreNote[] = []
  const measures: JianpuScoreMeasure[] = []
  const keySignatures: JianpuScoreKey[] = [{ start: 0, key: jianpuKeyNumber(document.key) }]
  const layoutTimeSignatures: JianpuScoreMeter[] = []
  const timeSignatures: JianpuScoreMeter[] = []
  const tempos: JianpuScoreTempo[] = [{ start: 0, qpm: document.tempo }]
  const lyrics: JianpuScoreLyric[] = []
  const tuplets: JianpuScoreTuplet[] = []
  const graces: JianpuScoreGrace[] = []
  const continuations: JianpuScoreContinuation[] = []
  const pendingTies = new Map<string, NoteAtom>()
  let previousKey = document.key
  let previousTempo = document.tempo
  let measureNumber = 0

  const attachLyrics = (atom: NoteAtom) => {
    const verses = lyricMap.get(atom.xmlId) ?? lyricMap.get(atom.xmlId.replace(/-n\d+$/, '')) ?? []
    for (const verse of verses) {
      lyrics.push({
        staff: atom.staff,
        start: atom.start,
        verse: verse.verse,
        n: verse.n,
        passes: verse.passes,
        text: verse.text,
        underlined: verse.underlined,
        extender: verse.extender,
        kind: verse.kind,
        wordpos: verse.wordpos,
        xmlId: atom.xmlId,
      })
    }
  }

  const processEvent = (event: ScoreEvent, staff: JianpuScoreStaff, start: number) => {
    const eventId = assignedIds.get(event)
    if (!eventId) return
    if (event.key !== previousKey) {
      keySignatures.push({ start, key: jianpuKeyNumber(event.key) })
      previousKey = event.key
    }
    if (event.tempo !== undefined && event.tempo !== previousTempo) {
      tempos.push({ start, qpm: event.tempo })
      previousTempo = event.tempo
    }
    const atoms: NoteAtom[] = []
    const emitted = new Map<string, NoteAtom>()
    const absorbedTargets = new Map<string, NoteAtom>()
    const atomFor = (pitch: string, atomStart: number, length: number, xmlId: string): NoteAtom => ({
      staff,
      start: atomStart,
      length,
      pitch: m3nPitchToMidi(pitch, event.key, event.octaveShift),
      xmlId,
      sourceStart: event.sourceStart,
      sourceEnd: event.sourceEnd,
      staccato: event.postfixes.includes('tip'),
      trill: event.postfixes.includes('tr'),
      accent: event.postfixes.includes('str'),
      dynamic: event.dynamic,
    })

    if (event.kind === 'note' || event.kind === 'chord') {
      event.pitches.forEach((pitch, index) => {
        const xmlId = event.pitches.length > 1 ? `${eventId}-n${index + 1}` : eventId
        atoms.push(atomFor(pitch, start, event.beats, xmlId))
      })
    } else if (event.kind === 'tuplet' && event.tuplet) {
      const { num, numbase, unitBeats } = event.tuplet
      const children: JianpuScoreTuplet['children'] = []
      event.pitches.forEach((pitch, index) => {
        const childStart = roundedQuarter(start + index * unitBeats)
        if (pitch === '0') return
        const atom = atomFor(pitch, childStart, unitBeats, `${eventId}-n${index + 1}`)
        atoms.push(atom)
        children.push({ pitch: atom.pitch, start: childStart, xmlId: atom.xmlId })
      })
      tuplets.push({ staff, start, length: event.beats, num, numbase, xmlId: eventId, children })
    }

    for (const atom of atoms) {
      const key = `${staff}:${atom.pitch}`
      const previous = pendingTies.get(key)
      if (previous && Math.abs(previous.start + previous.length - atom.start) < 1e-6) {
        previous.length = roundedQuarter(atom.start + atom.length - previous.start)
        absorbedTargets.set(key, previous)
        continuations.push({ staff, start: atom.start, xmlId: atom.xmlId })
        attachLyrics(atom)
        continue
      }
      pendingTies.delete(key)
      notes.push(atom)
      emitted.set(key, atom)
      attachLyrics(atom)
    }

    const tiedKeys = event.kind === 'tuplet' && event.tie
      ? (atoms.at(-1) ? new Set([`${staff}:${atoms.at(-1)!.pitch}`]) : new Set<string>())
      : event.tie
        ? new Set(atoms.map((atom) => `${staff}:${atom.pitch}`))
        : new Set<string>()
    for (const key of tiedKeys) {
      const target = absorbedTargets.get(key) ?? emitted.get(key)
      if (target) pendingTies.set(key, target)
    }

    for (const postfix of event.postfixes) {
      const grace = parseM3NGrace(postfix)
      if (!grace) continue
      for (const pitch of parseM3NGroupPitches(grace.pitchSource) ?? []) {
        graces.push({
          staff,
          start,
          pitch: m3nPitchToMidi(pitch, event.key, event.octaveShift),
          kind: grace.kind,
          xmlId: eventId,
        })
      }
    }
  }

  for (const [partIndex, part] of parts.entries()) {
    const measureCount = Math.max(part.melody.length, hasBass ? part.bass.length : 0)
    let quarter = 0
    let previousMeter = { count: document.meterCount, unit: document.meterUnit }
    for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
      const melody = part.melody[measureIndex]
      const meterEvent = melody?.events.find((event) => event.meterCount !== undefined)
      const meter = {
        count: meterEvent?.meterCount ?? previousMeter.count,
        unit: meterEvent?.meterUnit ?? previousMeter.unit,
      }
      const expectedBeats = meter.count * 4 / meter.unit
      const actualBeats = melody?.multiRest
        ? expectedBeats
        : measureEventBeats(melody?.events ?? [])
      const measureLength = Math.max(actualBeats, 0.0001)
      const measureStart = quarter
      quarter += measureLength
      measureNumber += 1
      const measureId = `m3n-measure-${partIndex + 1}-${measureIndex + 1}`

      layoutTimeSignatures.push({
        start: roundedQuarter(measureStart),
        numerator: roundedQuarter(measureLength * meter.unit / 4),
        denominator: meter.unit,
      })
      if (measureIndex === 0 || meter.count !== previousMeter.count || meter.unit !== previousMeter.unit) {
        timeSignatures.push({ start: roundedQuarter(measureStart), numerator: meter.count, denominator: meter.unit })
        previousMeter = meter
      }

      let melodyOffset = 0
      for (const event of melody?.events ?? []) {
        processEvent(event, 'melody', roundedQuarter(measureStart + melodyOffset))
        melodyOffset += event.beats
      }
      let bassOffset = 0
      for (const event of part.bass[measureIndex]?.events ?? []) {
        processEvent(event, 'bass', roundedQuarter(measureStart + bassOffset))
        bassOffset += event.beats
      }

      const navigation = melody?.navigation ?? melody?.events.flatMap((event) => event.navigation) ?? []
      measures.push({
        partIndex,
        index: measureIndex,
        number: measureNumber,
        start: roundedQuarter(measureStart),
        length: roundedQuarter(measureLength),
        meterCount: meter.count,
        meterUnit: meter.unit,
        xmlId: measureId,
        ending: melody?.ending,
        repeatStart: melody?.left === 'rptstart',
        repeatEnd: melody?.right === 'rptend',
        repeatCount: melody?.repeatCount ?? (melody?.right === 'rptend' ? 2 : undefined),
        navigation: navigation as JianpuScoreMeasure['navigation'],
        sectionLabel: melody?.events.find((event) => event.sectionLabel)?.sectionLabel,
        multiRest: melody?.multiRest,
      })
    }
  }

  return {
    title: document.title,
    subtitle: document.subtitle,
    singer: document.singer,
    composer: document.composer,
    lyricist: document.lyricist,
    arranger: document.arranger,
    key: document.key,
    tempo: document.tempo,
    meterCount: document.meterCount,
    meterUnit: document.meterUnit,
    hasBass,
    notes,
    measures,
    keySignatures,
    layoutTimeSignatures,
    timeSignatures,
    tempos,
    lyrics,
    tuplets,
    graces,
    continuations,
  }
}
