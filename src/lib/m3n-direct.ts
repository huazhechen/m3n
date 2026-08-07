import { parseM3NGrace, parseM3NGroupPitches, parseM3NTupletPitches } from './notation/m3n-groups'
import { durationInBeats, keyModeIntervals, parseKey, parseM3NNote } from './notation/m3n-primitives'
import { projectM3NDocument, type M3NDocumentProjection, type M3NDocumentStructure } from './notation/m3n-document'
import { tokenizeM3N } from './notation/m3n-tokens'
import { parseLyricItems } from './notation/lyrics'
import type { ScoreDocument, ScoreEvent, ScoreInterval, ScoreLyricBlock, ScoreMeasure, ScorePart } from './notation/score-document'
type DirectSettingEvent = {
  beats: number
  kind: 'key' | 'meter' | 'tempo'
  value: string
}

const metadataNames = ['title', 'subtitle', 'singer', 'composer', 'lyricist', 'arranger', 'copyright', 'source', 'note', 'transpose'] as const
function metadata(source: string, name: (typeof metadataNames)[number]) {
  return source.match(new RegExp(`\\{${name}=([^}]*)\\}`))?.[1]?.trim() ?? ''
}

function duration(depth: number, carets = 0, dots = 0) {
  return durationInBeats(depth, carets, dots)
}

type SourceRow = { text: string; start: number; passes?: string }
type ParsedBodySource = { text: string; positionAt: (offset: number) => number; phrasePasses: Array<{ start: number; end: number; passes: string }> }

function bodySource(rows: readonly SourceRow[]): ParsedBodySource {
  const positions: number[] = []
  const text = rows.map((row, index) => {
    if (index > 0) positions.push(rows[index - 1]?.start ?? 0)
    positions.push(...Array.from({ length: row.text.length }, (_, offset) => row.start + offset))
    return row.text
  }).join('\n')
  return {
    text,
    positionAt: (offset) => positions[offset] ?? (positions.at(-1) ?? 0) + 1,
    phrasePasses: rows.flatMap((row) => row.passes ? [{ start: row.start, end: row.start + row.text.length, passes: row.passes }] : []),
  }
}

function parseBody(
  source: string,
  staff: 'melody' | 'bass',
  parts: Map<string, ScorePart>,
  initialKey: string,
  initialMeterCount: number,
  initialMeterUnit: number,
  initialTempo: number,
  intervals: ScoreInterval[],
  settingEvents: DirectSettingEvent[] = [],
  inheritedSettingEvents: DirectSettingEvent[] = [],
  phrasePasses: ReadonlyArray<{ start: number; end: number; passes: string }> = [],
  positionAt: (offset: number) => number = (offset) => offset,
) {
  let depth = 0
  let currentKey = initialKey
  let currentMeterCount = initialMeterCount
  let currentMeterUnit = initialMeterUnit
  let currentTempo = initialTempo
  let activeEnding: string | undefined
  let currentDynamic: string | undefined
  let dynamicChanged = false
  let currentChord: string | undefined
  let chordChanged = false
  let pendingPrefix: 'sfz' | undefined
  let lastEvent: ScoreEvent | undefined
  let pendingRepeatEnd: ScoreMeasure | undefined
  let lastBarLine: number | undefined
  let elapsedBeats = 0
  let inheritedSettingIndex = 0
  const structureStack: Array<string | ScoreInterval> = []

  const getPart = () => {
    let part = parts.get('score')
    if (!part) {
      part = { melody: [{ events: [] }], bass: [{ events: [] }] }
      parts.set('score', part)
    }
    return part
  }
  const measures = () => getPart()[staff]
  const measure = () => measures().at(-1) as ScoreMeasure
  const syncActiveEnding = (sourceStart: number) => {
    activeEnding = phrasePasses.find((phrase) => phrase.start <= sourceStart && sourceStart < phrase.end)?.passes
  }
  const ensureEndingMeasure = () => {
    const current = measure()
    if (current.events.length > 0 && current.ending !== activeEnding) {
      measures().push({ events: [], ending: activeEnding })
    } else if (current.events.length === 0) {
      current.ending = activeEnding
    }
  }
  const add = (event: ScoreEvent) => {
    syncActiveEnding(event.sourceStart)
    ensureEndingMeasure()
    event.dynamic = dynamicChanged ? currentDynamic : undefined
    event.chord = chordChanged ? currentChord : undefined
    event.prefix = pendingPrefix
    event.octaveShift = structureStack.reduce((shift, item) => {
      const kind = typeof item === 'object' ? item.kind : item
      return kind === '8va' ? shift + 1 : kind === '8vb' ? shift - 1 : shift
    }, 0)
    event.meterCount = currentMeterCount
    event.meterUnit = currentMeterUnit
    event.tempo = currentTempo
    event.navigation = []
    for (const item of structureStack) {
      if (typeof item !== 'object') continue
      item.start ??= event.sourceStart
      item.end = event.sourceEnd
      item.endStart = event.sourceStart
    }
    measure().events.push(event)
    elapsedBeats += event.beats
    lastEvent = event
    pendingPrefix = undefined
    dynamicChanged = false
    chordChanged = false
  }

  const applyInheritedSettings = () => {
    while (inheritedSettingIndex < inheritedSettingEvents.length) {
      const event = inheritedSettingEvents[inheritedSettingIndex]
      if (!event) break
      if (event.beats > elapsedBeats) break
      if (event.kind === 'key') currentKey = event.value
      if (event.kind === 'meter') {
        const [count, unit] = event.value.split('/').map(Number)
        if (count !== undefined && unit !== undefined) {
          currentMeterCount = count
          currentMeterUnit = unit
        }
      }
      if (event.kind === 'tempo') currentTempo = Number(event.value)
      inheritedSettingIndex += 1
    }
  }

  for (const token of tokenizeM3N(source)) {
    const sourceStart = positionAt(token.start)
    const sourceEnd = positionAt(token.end - 1) + 1
    if (token.kind === 'space' || token.kind === 'comment') continue
    if (token.kind === 'attribute') {
      const value = token.content ?? ''
      const repeatCount = /^x(\d+)$/.exec(value)
      if (repeatCount && pendingRepeatEnd) {
        pendingRepeatEnd.repeatCount = Number(repeatCount[1])
        pendingRepeatEnd = undefined
        continue
      }
      pendingRepeatEnd = undefined
      if (value.startsWith('key=')) {
        currentKey = value.slice(4)
        if (staff === 'melody') settingEvents.push({ beats: elapsedBeats, kind: 'key', value: currentKey })
      }
      if (value.startsWith('key=') && currentChord) chordChanged = true
      const meter = /^(\d+)\/(\d+)$/.exec(value)
      if (meter) {
        currentMeterCount = Number(meter[1])
        currentMeterUnit = Number(meter[2])
        if (staff === 'melody') settingEvents.push({ beats: elapsedBeats, kind: 'meter', value: `${currentMeterCount}/${currentMeterUnit}` })
      }
      const tempo = /^(\d+)qpm$/.exec(value)
      if (tempo) {
        currentTempo = Number(tempo[1])
        if (staff === 'melody') settingEvents.push({ beats: elapsedBeats, kind: 'tempo', value: String(currentTempo) })
      }
      const multiRest = /^rest=(\d+)$/.exec(value)
      if (multiRest) {
        syncActiveEnding(sourceStart)
        ensureEndingMeasure()
        measure().multiRest = Number(multiRest[1])
        elapsedBeats += Number(multiRest[1]) * currentMeterCount * 4 / currentMeterUnit
      }
      if (value === 'br') {
        const current = measure()
        if (current.events.length === 0) current.breakBefore = true
        else current.breakAfter = true
      }
      if (/^(?:lg|cresc|decres|dim|8va|8vb|inst)(?:=text)?$/.test(value) || /^(?:accel|rit)=\d+$/.test(value)) {
        const ramp = /^(accel|rit)=(\d+)$/.exec(value)
        const [intervalName, display] = value.split('=')
        const kind = intervalName === 'dim' ? 'decres' : intervalName
        const interval: ScoreInterval = { id: intervals.length + 1, staff, kind: kind as ScoreInterval['kind'] }
        if (display === 'text') interval.display = 'text'
        if (ramp) {
          interval.kind = ramp[1] as 'accel' | 'rit'
          interval.tempoTarget = Number(ramp[2])
        }
        intervals.push(interval)
        structureStack.push(interval)
        lastEvent = undefined
      } else if (/^(?:ppp|pp|p|mp|mf|f|ff|fff)$/.test(value)) {
        currentDynamic = value
        dynamicChanged = true
        lastEvent = undefined
      } else if (value.startsWith('chord=')) {
        currentChord = value.slice(6)
        chordChanged = true
        lastEvent = undefined
      } else if (value === 'sfz') {
        pendingPrefix = 'sfz'
        lastEvent = undefined
      } else if (/^(?:segno|ds|dc|fine)$/.test(value)) {
        const navigation = value as 'segno' | 'ds' | 'dc' | 'fine'
        const current = measure()
        current.navigation ??= []
        current.navigation.push(navigation)
      } else if (/^(?:arp|tr|str|brk|tip|hold|fermata|breath|f[1-5])$/.test(value) || parseM3NGrace(value)) {
        if (lastEvent) lastEvent.postfixes.push(value)
      } else if (value === '/' || value.startsWith('/')) {
        const named = value.slice(1)
        const index = named
          ? structureStack.map((item) => typeof item === 'object' ? item.kind : item).lastIndexOf(named)
          : structureStack.length - 1
        const closed = index >= 0 ? structureStack.splice(index, 1)[0] : undefined
        if (typeof closed === 'object' && closed.tempoTarget !== undefined) {
          currentTempo = closed.tempoTarget
          if (staff === 'melody') settingEvents.push({ beats: elapsedBeats, kind: 'tempo', value: String(currentTempo) })
        }
        lastEvent = undefined
      }
      continue
    }
    if (token.kind === 'bar') {
      const current = measure()
      const value = token.raw
      const previous = measures().at(-2)
      const redundantPhraseBar = /^(?:\|\|\||\|\||\|)$/.test(value)
        && current.events.length === 0 && !current.multiRest
        && previous?.barEnd !== undefined && lastBarLine !== undefined && token.line > lastBarLine
      if (redundantPhraseBar) {
        lastBarLine = token.line
        continue
      }
      if (value === '||:' && current.events.length === 0 && !current.multiRest) {
        current.left = 'rptstart'
        lastBarLine = token.line
        continue
      }
      current.right = value.startsWith(':||') ? 'rptend'
        : value.includes('|||') ? 'end'
          : value === '||' ? 'dbl' : 'single'
      current.barEnd = sourceEnd
      pendingRepeatEnd = value.startsWith(':||') ? current : undefined
      const next: ScoreMeasure = { events: [], ending: activeEnding }
      if (value === '||:' || value === ':||:') next.left = 'rptstart'
      measures().push(next)
      lastBarLine = token.line
      lastEvent = undefined
      continue
    }
    if (token.kind === 'open-paren') {
      pendingRepeatEnd = undefined
      depth += 1
      continue
    }
    if (token.kind === 'close-paren') {
      pendingRepeatEnd = undefined
      depth = Math.max(0, depth - 1)
      continue
    }
    const group = token.kind === 'group' ? /^\[([^\]:]+):([^\]]+)\](\^*)(\.*)(~?)/.exec(token.raw) : null
    if (group !== null) {
      applyInheritedSettings()
      pendingRepeatEnd = undefined
      const mode = group[2]?.trim() ?? ''
      const tuplet = mode === 'h' ? null : parseM3NTupletPitches(group[1] ?? '')
      const pitches = mode === 'h' ? parseM3NGroupPitches(group[1] ?? '') ?? [] : tuplet?.pitches ?? []
      if (pitches.length > 0) {
        const first = parseM3NNote(pitches[0] ?? '')
        const carets = group[3] ?? ''
        const dots = group[4] ?? ''
        const groupBeats = duration(depth, (first?.carets.length ?? 0) + carets.length, (first?.dots.length ?? 0) + dots.length)
        add({
          sourceStart,
          sourceEnd,
          kind: mode === 'h' ? 'chord' : 'tuplet',
          pitches,
          key: currentKey,
          beats: mode === 'h' ? groupBeats : (Number(mode) || pitches.length - 1) * duration(depth, carets.length, dots.length),
          tie: mode === 'h' ? Boolean(group[5]) : Boolean(tuplet?.tiesFromLast),
          tieFromTupletIndex: tuplet?.tiesFromLast ? pitches.length - 1 : undefined,
          postfixes: [],
          navigation: [],
          octaveShift: 0,
          tuplet: mode === 'h' ? undefined : {
            num: pitches.length,
            numbase: Number(mode) || pitches.length - 1,
            unitBeats: duration(depth, carets.length, dots.length),
          },
        })
      }
      continue
    }
    const noteToken = token.kind === 'note' ? token.raw : undefined
    const note = noteToken ? parseM3NNote(noteToken) : null
    if (note && noteToken) {
      applyInheritedSettings()
      pendingRepeatEnd = undefined
      add({
        sourceStart,
        sourceEnd,
        kind: note.degreeRaw === '0' ? 'rest' : 'note',
        pitches: note.degreeRaw === '0' ? [] : [noteToken.replace(/[\^.~]+$/g, '')],
        key: currentKey,
        beats: duration(depth, note.carets.length, note.dots.length),
        tie: Boolean(note.tie),
        postfixes: [],
        navigation: [],
        octaveShift: 0,
      })
      continue
    }
  }

  const trailing = measure()
  const previous = measures().at(-2)
  const trailingEndNavigation = trailing.events.length === 0 && !trailing.multiRest
    ? trailing.navigation?.filter((value) => value !== 'segno') ?? []
    : []
  if (previous && trailingEndNavigation.length > 0) {
    previous.navigation ??= []
    previous.navigation.push(...trailingEndNavigation)
    trailing.navigation = trailing.navigation?.filter((value) => value === 'segno')
  }
}

export function m3nPitch(pitch: string, key: string) {
  const parsed = parseM3NNote(pitch)
  if (!parsed || parsed.degreeRaw === '0') return { pname: 'c', oct: 4, accid: '' }
  const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
  const { tonic, mode } = parseKey(key)
  const tonicIndex = Math.max(0, letters.indexOf(tonic.charAt(0) || 'C'))
  const degree = Number(parsed.degreeRaw)
  const letterIndex = (tonicIndex + degree - 1) % 7
  const natural = [0, 2, 4, 5, 7, 9, 11]
  const tonicPitch = (natural[tonicIndex] ?? 0) + (tonic.endsWith('#') ? 1 : tonic.endsWith('b') ? -1 : 0)
  const target = (tonicPitch + (keyModeIntervals(mode)[degree - 1] ?? 0) + 12) % 12
  const difference = (target - (natural[letterIndex] ?? 0) + 12) % 12
  const keyAccid = difference === 1 ? 's' : difference === 2 ? 'ss'
    : difference === 11 ? 'f' : difference === 10 ? 'ff' : ''
  const explicitOffset = parsed.accidentals === '##' ? 2 : parsed.accidentals.includes('#') ? 1
    : parsed.accidentals === 'bb' ? -2 : parsed.accidentals.includes('b') ? -1 : 0
  const explicitDifference = (difference + explicitOffset + 12) % 12
  const explicit = parsed.accidentals.includes('=') ? (keyAccid || 'n')
    : parsed.accidentals ? explicitDifference === 1 ? 's' : explicitDifference === 2 ? 'ss'
      : explicitDifference === 11 ? 'f' : explicitDifference === 10 ? 'ff' : 'n'
      : ''
  const octaveShift = [...parsed.octave].reduce((sum, value) => sum + (value === 'e' ? 1 : -1), 0)
  return {
    pname: (letters[letterIndex] ?? 'C').toLowerCase(),
    oct: 4 + (letterIndex < tonicIndex ? 1 : 0) + octaveShift,
    accid: explicit === 'ss' ? 'x' : explicit,
    accidGes: explicit || keyAccid,
  }
}

function applyPhraseRows(document: ScoreDocument, structure: M3NDocumentStructure) {
  const score = document.parts.get('score')
  if (!score) return

  for (const section of structure.sections) for (const phrase of section.phrases) {
    if (!phrase.melody || !phrase.harmony) continue
    const melodyEnd = phrase.melody.start + phrase.melody.text.length
    const measures = score.melody.filter((measure) => measure.events.some((event) => (
      phrase.melody!.start <= event.sourceStart && event.sourceStart < melodyEnd
    )))
    for (const [measureIndex, harmony] of phrase.harmony.text.split(/\|+/).entries()) {
      const events = measures[measureIndex]?.events ?? []
      if (events.length === 0) continue
      let depth = 0
      let offset = 0
      for (const token of harmony.matchAll(/\(|\)|(?:VII|III|II|IV|VI|V|I|vii|iii|ii|iv|vi|v|i)(?:m|dim|aug|sus2|sus4|maj7|maj9|[2-9]|1[0-3])?/g)) {
        const value = token[0]
        if (value === '(') { depth += 1; continue }
        if (value === ')') { depth = Math.max(0, depth - 1); continue }
        let elapsed = 0
        const target = events.find((event) => {
          const matches = elapsed + 1e-9 >= offset
          elapsed += event.beats
          return matches
        }) ?? events.at(-1)
        if (target) target.chord = value
        offset += (events[0]?.meterCount ?? document.meterCount) * 4 /
          (events[0]?.meterUnit ?? document.meterUnit) / 2 ** depth
      }
    }
  }

  const lyrics: ScoreLyricBlock[] = []
  for (const section of structure.sections) for (const phrase of section.phrases) {
    if (!phrase.melody) continue
    for (const lyric of phrase.lyrics) {
      if (/^\{L(\d+)\}$/.test(lyric.text.trim())) continue
      lyrics.push({
        range: lyric.label,
        mode: 'char',
        syllables: parseLyricItems(lyric.text.replace(/\s*\|\s*/g, ' '), lyric.start),
        phrasePasses: phrase.passes || undefined,
        targetStart: phrase.melody.start,
        targetEnd: phrase.melody.start + phrase.melody.text.length,
      })
    }
  }
  document.lyrics = lyrics

  for (const section of structure.sections) {
    const melody = section.phrases.find((phrase) => phrase.melody)?.melody
    if (!section.name || !melody) continue
    const melodyEnd = melody.start + melody.text.length
    const event = score.melody.flatMap((measure) => measure.events)
      .find((candidate) => melody.start <= candidate.sourceStart && candidate.sourceStart < melodyEnd)
    if (event) event.sectionLabel = section.name
  }
}

export function parseM3NDocument(source: string, projection: M3NDocumentProjection = projectM3NDocument(source)): ScoreDocument {
  const key = source.match(/\{key=([^}]+)\}/)?.[1]?.trim() || 'C'
  const meter = source.match(/\{(\d+)\/(\d+)\}/)
  const tempo = source.match(/\{(\d+)qpm\}/)?.[1]
  const parts = new Map<string, ScorePart>()
  const intervals: ScoreInterval[] = []
  const settingEvents: DirectSettingEvent[] = []
  const meterCount = Number(meter?.[1] ?? 4)
  const meterUnit = Number(meter?.[2] ?? 4)
  const initialTempo = Number(tempo ?? 120)
  const phrases = projection.structure.sections.flatMap((section) => section.phrases)
  const melody = bodySource(phrases.flatMap((phrase) => phrase.melody
    ? [{ text: phrase.melody.text, start: phrase.melody.start, passes: phrase.passes || undefined }]
    : []))
  const bass = bodySource(phrases.flatMap((phrase) => phrase.bass
    ? [{ text: phrase.bass.text, start: phrase.bass.start }]
    : []))
  const fallback = projection.structure.sections.length === 0 ? bodySource([{ text: source, start: 0 }]) : undefined
  const melodyBody = fallback ?? melody
  parseBody(melodyBody.text, 'melody', parts, key, meterCount, meterUnit, initialTempo, intervals, settingEvents, [], melodyBody.phrasePasses, melodyBody.positionAt)
  if (bass.text) parseBody(bass.text, 'bass', parts, key, meterCount, meterUnit, initialTempo, intervals, [], settingEvents, [], bass.positionAt)
  const document: ScoreDocument = {
    title: metadata(source, 'title'),
    subtitle: metadata(source, 'subtitle'),
    singer: metadata(source, 'singer'),
    composer: metadata(source, 'composer'),
    lyricist: metadata(source, 'lyricist'),
    arranger: metadata(source, 'arranger'),
    copyright: metadata(source, 'copyright'),
    source: metadata(source, 'source'),
    note: metadata(source, 'note'),
    transpose: metadata(source, 'transpose'),
    key,
    meterCount,
    meterUnit,
    tempo: initialTempo,
    hasExplicitTempo: tempo !== undefined,
    lyrics: [],
    parts,
    intervals,
  }
  applyPhraseRows(document, projection.structure)
  return document
}
