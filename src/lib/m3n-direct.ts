import { parseM3NGrace, parseM3NGroupPitches } from './notation/m3n-groups'
import { durationInBeats, keyModeIntervals, parseKey, parseM3NNote } from './notation/m3n-primitives'
import { splitSupplementBlocks } from './notation/supplements'
import { parseLyricItems } from './notation/lyrics'
import { tokenizeM3N } from './notation/m3n-tokens'

export type DirectEvent = {
  sourceStart: number
  sourceEnd: number
  kind: 'note' | 'chord' | 'rest' | 'tuplet'
  pitches: string[]
  key: string
  beats: number
  tie: boolean
  dynamic?: string
  chord?: string
  chordState?: string
  prefix?: 'sfz'
  postfixes: string[]
  navigation: Array<'segno' | 'ds' | 'dc' | 'fine'>
  octaveShift: number
  meterCount?: number
  meterUnit?: number
  tempo?: number
  tuplet?: { num: number; numbase: number; unitBeats: number }
}

export type DirectInterval = {
  id: number
  staff: 'melody' | 'bass'
  kind: 'cresc' | 'decres' | 'lg' | '8va' | '8vb' | 'accel' | 'rit' | 'inst'
  tempoTarget?: number
  start?: number
  end?: number
  endStart?: number
}

export type DirectMeasure = { events: DirectEvent[]; left?: string; right?: string; ending?: string; breakBefore?: boolean; breakAfter?: boolean; multiRest?: number; repeatCount?: number }
export type DirectPart = { melody: DirectMeasure[]; bass: DirectMeasure[] }
export type DirectLyricSyllable = { text: string; sourceStart: number; sourceEnd: number; forceTiedTarget: boolean; kind: 'text' | 'placeholder' | 'extender'; underlined: boolean; wordpos?: 'i' | 'm' | 't' }
export type DirectLyricBlock = { range: string; mode: 'char' | 'word'; syllables: DirectLyricSyllable[] }
type DirectSettingEvent = {
  beats: number
  kind: 'key' | 'meter' | 'tempo'
  value: string
}

export type DirectDocument = {
  title: string
  subtitle: string
  category: string
  singer: string
  composer: string
  lyricist: string
  arranger: string
  copyright: string
  source: string
  note: string
  transpose: string
  key: string
  meterCount: number
  meterUnit: number
  tempo: number
  hasExplicitTempo: boolean
  lyrics: DirectLyricBlock[]
  parts: Map<string, DirectPart>
  partOrder: string[]
  intervals: DirectInterval[]
}

const metadataNames = ['title', 'subtitle', 'category', 'singer', 'composer', 'lyricist', 'arranger', 'copyright', 'source', 'note', 'transpose'] as const
function metadata(source: string, name: (typeof metadataNames)[number]) {
  return source.match(new RegExp(`\\{${name}=([^}]*)\\}`))?.[1]?.trim() ?? ''
}

function duration(depth: number, carets = 0, dots = 0) {
  return durationInBeats(depth, carets, dots)
}

function parseBody(
  source: string,
  staff: 'melody' | 'bass',
  parts: Map<string, DirectPart>,
  initialKey: string,
  initialMeterCount: number,
  initialMeterUnit: number,
  initialTempo: number,
  intervals: DirectInterval[],
  settingEvents: DirectSettingEvent[] = [],
  inheritedSettingEvents: DirectSettingEvent[] = [],
) {
  let depth = 0
  let currentKey = initialKey
  let currentMeterCount = initialMeterCount
  let currentMeterUnit = initialMeterUnit
  let currentTempo = initialTempo
  let commonKey = initialKey
  let commonMeterCount = initialMeterCount
  let commonMeterUnit = initialMeterUnit
  let commonTempo = initialTempo
  let currentPart = 'score'
  let hasParts = false
  let activeEnding: string | undefined
  let currentDynamic: string | undefined
  let dynamicChanged = false
  let currentChord: string | undefined
  let chordChanged = false
  let pendingPrefix: 'sfz' | undefined
  let lastEvent: DirectEvent | undefined
  let pendingNavigation: Array<'segno' | 'ds' | 'dc' | 'fine'> = []
  let pendingRepeatEnd: DirectMeasure | undefined
  let elapsedBeats = 0
  let inheritedSettingIndex = 0
  const structureStack: Array<string | DirectInterval> = []

  const getPart = () => {
    let part = parts.get(currentPart)
    if (!part) {
      part = { melody: [{ events: [] }], bass: [{ events: [] }] }
      parts.set(currentPart, part)
    }
    return part
  }
  const measures = () => getPart()[staff]
  const measure = () => measures().at(-1) as DirectMeasure
  const ensureEndingMeasure = () => {
    const current = measure()
    if (current.events.length > 0 && current.ending !== activeEnding) {
      measures().push({ events: [], ending: activeEnding })
    } else if (current.events.length === 0) {
      current.ending = activeEnding
    }
  }
  const add = (event: DirectEvent) => {
    ensureEndingMeasure()
    event.dynamic = dynamicChanged ? currentDynamic : undefined
    event.chord = chordChanged ? currentChord : undefined
    event.chordState = currentChord
    event.prefix = pendingPrefix
    event.octaveShift = structureStack.reduce((shift, item) => {
      const kind = typeof item === 'object' ? item.kind : item
      return kind === '8va' ? shift + 1 : kind === '8vb' ? shift - 1 : shift
    }, 0)
    event.meterCount = currentMeterCount
    event.meterUnit = currentMeterUnit
    event.tempo = currentTempo
    event.navigation = pendingNavigation
    pendingNavigation = []
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
      if (event.beats > elapsedBeats) break
      if (event.kind === 'key') currentKey = event.value
      if (event.kind === 'meter') {
        const [count, unit] = event.value.split('/').map(Number)
        currentMeterCount = count
        currentMeterUnit = unit
      }
      if (event.kind === 'tempo') currentTempo = Number(event.value)
      inheritedSettingIndex += 1
    }
  }

  for (const token of tokenizeM3N(source)) {
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
        if (!hasParts) commonKey = currentKey
        if (staff === 'melody') settingEvents.push({ beats: elapsedBeats, kind: 'key', value: currentKey })
      }
      if (value.startsWith('key=') && currentChord) chordChanged = true
      const meter = /^(\d+)\/(\d+)$/.exec(value)
      if (meter) {
        currentMeterCount = Number(meter[1])
        currentMeterUnit = Number(meter[2])
        if (!hasParts) {
          commonMeterCount = currentMeterCount
          commonMeterUnit = currentMeterUnit
        }
        if (staff === 'melody') settingEvents.push({ beats: elapsedBeats, kind: 'meter', value: `${currentMeterCount}/${currentMeterUnit}` })
      }
      const tempo = /^(\d+)qpm$/.exec(value)
      if (tempo) {
        currentTempo = Number(tempo[1])
        if (!hasParts) commonTempo = currentTempo
        if (staff === 'melody') settingEvents.push({ beats: elapsedBeats, kind: 'tempo', value: String(currentTempo) })
      }
      const multiRest = /^rest=(\d+)$/.exec(value)
      if (multiRest) {
        measure().multiRest = Number(multiRest[1])
        elapsedBeats += Number(multiRest[1]) * currentMeterCount * 4 / currentMeterUnit
      }
      if (value === 'br') {
        const current = measure()
        if (current.events.length === 0) current.breakBefore = true
        else current.breakAfter = true
      }
      if (value.startsWith('part=')) {
        hasParts = true
        currentKey = commonKey
        currentMeterCount = commonMeterCount
        currentMeterUnit = commonMeterUnit
        currentTempo = commonTempo
        currentPart = value.slice(5).trim() || 'score'
        structureStack.push('part')
      } else if (value.startsWith('volta=')) {
        structureStack.push('volta')
        activeEnding = value.slice(6).trim()
        ensureEndingMeasure()
      } else if (/^(?:lg|cresc|decres|8va|8vb|inst)$/.test(value) || /^(?:accel|rit)=\d+$/.test(value)) {
        const ramp = /^(accel|rit)=(\d+)$/.exec(value)
        const interval: DirectInterval = { id: intervals.length + 1, staff, kind: value as DirectInterval['kind'] }
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
        if (navigation !== 'segno' && lastEvent) lastEvent.navigation.push(navigation)
        else pendingNavigation.push(navigation)
      } else if (/^(?:arp|tr|str|brk|tip|hold|fermata|breath|f[1-5])$/.test(value) || parseM3NGrace(value)) {
        if (lastEvent) lastEvent.postfixes.push(value)
      } else if (value === '/' || value.startsWith('/')) {
        const named = value.slice(1)
        const index = named
          ? structureStack.map((item) => typeof item === 'object' ? item.kind : item).lastIndexOf(named)
          : structureStack.length - 1
        const closed = index >= 0 ? structureStack.splice(index, 1)[0] : undefined
        if (closed === 'volta') activeEnding = undefined
        if (typeof closed === 'object' && closed.tempoTarget !== undefined) {
          currentTempo = closed.tempoTarget
          if (staff === 'melody') settingEvents.push({ beats: elapsedBeats, kind: 'tempo', value: String(currentTempo) })
        }
        if (closed === 'part') {
          currentKey = commonKey
          currentMeterCount = commonMeterCount
          currentMeterUnit = commonMeterUnit
          currentTempo = commonTempo
        }
        lastEvent = undefined
      }
      continue
    }
    if (token.kind === 'bar') {
      const current = measure()
      const value = token.raw
      if (current.events.length === 0) {
        const trailingNavigation = pendingNavigation.filter((navigation) => navigation !== 'segno')
        const previousEvent = measures().at(-2)?.events.at(-1)
        if (previousEvent && trailingNavigation.length > 0) {
          previousEvent.navigation.push(...trailingNavigation)
          pendingNavigation = pendingNavigation.filter((navigation) => navigation === 'segno')
        }
      }
      if (value === '||:' && current.events.length === 0) {
        current.left = 'rptstart'
        continue
      }
      current.right = value.startsWith(':||') ? 'rptend'
        : value.includes('|||') ? 'end'
          : value === '||' ? 'dbl' : 'single'
      pendingRepeatEnd = value.startsWith(':||') ? current : undefined
      const next: DirectMeasure = { events: [], ending: activeEnding }
      if (value === '||:' || value === ':||:') next.left = 'rptstart'
      measures().push(next)
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
      const pitches = parseM3NGroupPitches(group[1] ?? '') ?? []
      const mode = group[2]?.trim() ?? ''
      const sourceEnd = token.start + group[0].length
      if (pitches.length > 0) {
        const first = parseM3NNote(pitches[0] ?? '')
        const groupBeats = duration(depth, (first?.carets.length ?? 0) + group[3].length, (first?.dots.length ?? 0) + group[4].length)
        add({
          sourceStart: token.start,
          sourceEnd,
          kind: mode === 'h' ? 'chord' : 'tuplet',
          pitches,
          key: currentKey,
          beats: mode === 'h' ? groupBeats : (Number(mode) || pitches.length - 1) * duration(depth, group[3].length, group[4].length),
          tie: Boolean(group[5]),
          postfixes: [],
          navigation: [],
          octaveShift: 0,
          tuplet: mode === 'h' ? undefined : {
            num: pitches.length,
            numbase: Number(mode) || pitches.length - 1,
            unitBeats: duration(depth, group[3].length, group[4].length),
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
        sourceStart: token.start,
        sourceEnd: token.start + noteToken.length,
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
}

export function m3nPitch(pitch: string, key: string) {
  const parsed = parseM3NNote(pitch)
  if (!parsed || parsed.degreeRaw === '0') return { pname: 'c', oct: 4, accid: '' }
  const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
  const { tonic, mode } = parseKey(key)
  const tonicIndex = Math.max(0, letters.indexOf(tonic[0] ?? 'C'))
  const degree = Number(parsed.degreeRaw)
  const letterIndex = (tonicIndex + degree - 1) % 7
  const natural = [0, 2, 4, 5, 7, 9, 11]
  const tonicPitch = natural[tonicIndex] + (tonic.endsWith('#') ? 1 : tonic.endsWith('b') ? -1 : 0)
  const target = (tonicPitch + (keyModeIntervals(mode)[degree - 1] ?? 0) + 12) % 12
  const difference = (target - natural[letterIndex] + 12) % 12
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
    pname: letters[letterIndex].toLowerCase(),
    oct: 4 + (letterIndex < tonicIndex ? 1 : 0) + octaveShift,
    accid: explicit === 'ss' ? 'x' : explicit,
    accidGes: explicit || keyAccid,
  }
}

export function parseM3NDocument(source: string): DirectDocument {
  const { main, bass, lyrics } = splitSupplementBlocks(source)
  const key = source.match(/\{key=([^}]+)\}/)?.[1]?.trim() || 'C'
  const meter = source.match(/\{(\d+)\/(\d+)\}/)
  const tempo = source.match(/\{(\d+)qpm\}/)?.[1]
  const parts = new Map<string, DirectPart>()
  const intervals: DirectInterval[] = []
  const settingEvents: DirectSettingEvent[] = []
  const meterCount = Number(meter?.[1] ?? 4)
  const meterUnit = Number(meter?.[2] ?? 4)
  const initialTempo = Number(tempo ?? 120)
  parseBody(main, 'melody', parts, key, meterCount, meterUnit, initialTempo, intervals, settingEvents)
  if (bass) parseBody(bass, 'bass', parts, key, meterCount, meterUnit, initialTempo, intervals, [], settingEvents)
  return {
    title: metadata(source, 'title'),
    subtitle: metadata(source, 'subtitle'),
    category: metadata(source, 'category'),
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
    lyrics: lyrics.map((item) => ({
      range: item.range,
      mode: item.mode,
      syllables: parseLyricItems(item.text, item.sourceStart, item.mode),
    })),
    parts,
    partOrder: main.match(/\{parts=([^}]*)\}/)?.[1]?.trim().split(/\s+/).filter(Boolean) ?? [],
    intervals,
  }
}
