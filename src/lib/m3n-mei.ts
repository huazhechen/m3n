import { m3nPitch, measurePlaybackPasses, parseM3NDocument } from './m3n-direct'
import type { DirectLyricSyllable } from './m3n-direct'
import { m3nChord } from './m3n-harmony'
import { buildAccompaniment, buildTempoChanges, type AccompanimentNote, type TempoChange } from './m3n-playback'
import type { DirectEvent, DirectMeasure } from './m3n-direct'
import { parseM3NGrace, parseM3NGroupPitches } from './notation/m3n-groups'
import { parseKey } from './notation/m3n-primitives'
import { validateM3N } from './m3n-validate'

export type MeiSourceMapRange = { xmlId: string; sourceStart: number; sourceEnd: number }
export type ScoreHeaderMetadata = {
  value: string
  side: 'left' | 'right' | 'center'
  priority: number
}

export type MeiConversionResult = {
  source: string
  mei: string
  diagnostics: string[]
  sourceMap: MeiSourceMapRange[]
  title: string
  subtitle: string
  singer: string
  composer: string
  lyricist: string
  arranger: string
  hasBassStaff: boolean
  partOrder: string[]
  headerMetadata: ScoreHeaderMetadata[]
  accompaniment: AccompanimentNote[]
  tempoChanges: TempoChange[]
  tempo: number
}

type LyricSyllable = DirectLyricSyllable
type VerseSyllable = LyricSyllable & { n: string; verseIndex: number; cjkSpacingCompensation: boolean }

function splitLyricSyllables(tokens: DirectLyricSyllable[]): LyricSyllable[] {
  return tokens
}

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

const CJK_OR_FULLWIDTH_CHARACTER = /[\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF01-\uFF60\uFFE0-\uFFEE]/u
const PUNCTUATION_ONLY = /^\p{P}+$/u

function lyricText(lyric: VerseSyllable) {
  const text = lyric.text.replaceAll('~', ' ')
  if (!lyric.cjkSpacingCompensation) return text
  const compensation = Array.from(text).filter((character) => CJK_OR_FULLWIDTH_CHARACTER.test(character)).map(() => '\u200B').join('')
  return `${text}${compensation}`
}

function underlinedLyricText(lyric: VerseSyllable) {
  return lyricText(lyric).split(/(\p{P}+)/u).filter(Boolean).map((segment) => (
    PUNCTUATION_ONLY.test(segment) ? escapeXml(segment) : `<rend>${escapeXml(segment)}</rend>`
  )).join('')
}

function keySignature(rawKey: string) {
  const pitchClasses: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  const { tonic, mode } = parseKey(rawKey)
  const tonicPitch = (pitchClasses[tonic[0] ?? 'C'] ?? 0) + (tonic.endsWith('#') ? 1 : tonic.endsWith('b') ? -1 : 0)
  const relativeMajor = (tonicPitch + ({ m: 3, dor: 10, phr: 8, lyd: 5, mix: 7, loc: 1 }[mode] ?? 0) + 12) % 12
  const fifths = [0, 7, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5][relativeMajor] ?? 0
  return fifths === 0 ? '0' : `${Math.abs(fifths)}${fifths > 0 ? 's' : 'f'}`
}

function durationAttributes(beats: number) {
  const candidates = [1, 2, 4, 8, 16, 32, 64].flatMap((dur) =>
    [0, 1, 2, 3].map((dots) => ({ dur, dots, beats: 4 / dur * (2 - 1 / 2 ** dots) })))
  const closest = candidates.reduce((best, item) =>
    Math.abs(item.beats - beats) < Math.abs(best.beats - beats) ? item : best)
  return `dur="${closest.dur}"${closest.dots ? ` dots="${closest.dots}"` : ''}`
}

const metronomeGlyphs: Record<number, { name: string; num: string }> = {
  1: { name: 'metNoteWhole', num: 'U+ECA2' },
  2: { name: 'metNoteHalfUp', num: 'U+ECA3' },
  4: { name: 'metNoteQuarterUp', num: 'U+ECA5' },
  8: { name: 'metNote8thUp', num: 'U+ECA7' },
  16: { name: 'metNote16thUp', num: 'U+ECA9' },
  32: { name: 'metNote32ndUp', num: 'U+ECAB' },
  64: { name: 'metNote64thUp', num: 'U+ECAD' },
}

function formatTempo(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$|0$/g, '')
}

function metronomeMark(qpm: number, meterUnit: number) {
  const unit = meterUnit
  const dots = 0
  const quarterNotesPerMark = 4 / unit
  const glyph = metronomeGlyphs[unit] ?? metronomeGlyphs[4]
  return { bpm: qpm / quarterNotesPerMark, dots, glyph }
}

function tempoXml(qpm: number, meterUnit: number, position: string, id: string) {
  const mark = metronomeMark(qpm, meterUnit)
  const note = `<rend glyph.auth="smufl" glyph.name="${mark.glyph.name}" glyph.num="${mark.glyph.num}">&#x${mark.glyph.num.slice(2)};</rend>`
  const dot = mark.dots ? '<rend glyph.auth="smufl" glyph.name="augmentationDot" glyph.num="U+E1E7">&#xE1E7;</rend>' : ''
  return `<tempo xml:id="${id}" staff="1" ${position} midi.bpm="${qpm}">${note}${dot} = ${formatTempo(mark.bpm)}</tempo>`
}

function pitchXml(pitch: string, key: string, accidentals?: Map<string, string>, octaveShift = 0) {
  const value = m3nPitch(pitch, key)
  const octave = value.oct + octaveShift
  const accidentalKey = `${value.pname}${octave}`
  if (value.accid) accidentals?.set(accidentalKey, value.accidGes ?? value.accid)
  const accidGes = value.accid ? value.accidGes : accidentals?.get(accidentalKey) || value.accidGes
  return `pname="${value.pname}" oct="${octave}"${value.accid ? ` accid="${value.accid}"` : ''}${accidGes ? ` accid.ges="${accidGes}"` : ''}`
}

function endingPasses(value: string) {
  const passes = new Set<number>()
  for (const token of value.split(',')) {
    const range = /^(\d+)~(\d+)$/.exec(token.trim())
    if (range) {
      for (let pass = Number(range[1]); pass <= Number(range[2]); pass += 1) passes.add(pass)
    } else {
      const pass = Number(token.trim())
      if (Number.isInteger(pass) && pass > 0) passes.add(pass)
    }
  }
  return passes
}

function chordSymbol(value: string, key: string) {
  return m3nChord(value, key)?.symbol ?? value
}

function verseXml(lyrics: VerseSyllable[], xmlId: string) {
  return lyrics.filter((lyric) => lyric.kind !== 'placeholder').map((lyric) => {
    const connection = lyric.kind === 'extender'
      ? ' con="u"'
      : lyric.underlined
        ? ' type="m3n-text-underline"'
      : lyric.wordpos ? ` wordpos="${lyric.wordpos}"${lyric.wordpos === 't' ? '' : ' con="d"'}` : ''
    const text = lyric.underlined && lyric.kind !== 'extender'
      ? underlinedLyricText(lyric)
      : escapeXml(lyricText(lyric))
    return `<verse xml:id="${xmlId}-v${lyric.verseIndex}" n="${lyric.n}"><syl${connection}>${text}</syl></verse>`
  }).join('')
}

function eventXml(event: DirectEvent, xmlId: string, lyrics: VerseSyllable[], accidentals?: Map<string, string>) {
  const verse = verseXml(lyrics, xmlId)
  const articulations = [
    event.postfixes.includes('str') ? '<artic artic="acc"/>' : '',
    event.postfixes.includes('brk') ? '<artic artic="stacciss"/>' : '',
    event.postfixes.includes('tip') ? '<artic artic="stacc"/>' : '',
    event.postfixes.includes('hold') ? '<artic artic="ten"/>' : '',
  ].join('')
  const graces = event.postfixes.flatMap((value) => {
    const parsed = parseM3NGrace(value)
    if (!parsed) return []
    const grace = parsed.kind === 'ac' ? 'unacc' : 'acc'
    const duration = 2 ** (parsed.depth + 2)
    const notes = (parseM3NGroupPitches(parsed.pitchSource) ?? [])
      .map((pitch) => `<note ${pitchXml(pitch, event.key)} dur="${duration}" grace="${grace}"/>`)
    const content = notes.length > 1 ? `<beam>${notes.join('')}</beam>` : notes.join('')
    return content ? [`<graceGrp attach="post">${content}</graceGrp>`] : []
  }).join('')
  if (event.kind === 'rest') return `<rest xml:id="${xmlId}" ${durationAttributes(event.beats)}/>`
  if (event.kind === 'chord') {
    const notes = event.pitches.map((pitch) => `<note ${pitchXml(pitch, event.key, accidentals)}/>`).join('')
    return `${graces}<chord xml:id="${xmlId}" ${durationAttributes(event.beats)}>${notes}${articulations}${verse}</chord>`
  }
  if (event.kind === 'tuplet' && event.tuplet) {
    const childBeats = event.tuplet.unitBeats
    let lyricIndex = 0
    const children = event.pitches.map((pitch, index) => {
      if (pitch === '0') return `<rest xml:id="${xmlId}-n${index + 1}" ${durationAttributes(childBeats)}/>`
      const childId = `${xmlId}-n${index + 1}`
      const childVerse = verseXml(lyrics.slice(lyricIndex, lyricIndex + 1), childId)
      lyricIndex += 1
      const note = `<note xml:id="${xmlId}-n${index + 1}" ${pitchXml(pitch, event.key, accidentals)} ${durationAttributes(childBeats)}`
      return childVerse ? `${note}>${childVerse}</note>` : `${note}/>`
    }).join('')
    const content = childBeats <= 0.5 && !event.pitches.includes('0') ? `<beam>${children}</beam>` : children
    return `<tuplet xml:id="${xmlId}" num="${event.tuplet.num}" numbase="${event.tuplet.numbase}">${content}</tuplet>`
  }
  return `${graces}<note xml:id="${xmlId}" ${pitchXml(event.pitches[0] ?? '1', event.key, accidentals)} ${durationAttributes(event.beats)}>${articulations}${verse}</note>`
}

type RenderedEvent = { event: DirectEvent; prefix?: string; xml: string }

function beamGroupBeats(meterCount: number, meterUnit: number) {
  const beat = 4 / meterUnit
  return meterUnit >= 8 && meterCount % 3 === 0 ? beat * 3 : beat
}

function beamXml(events: RenderedEvent[], meterCount: number, meterUnit: number) {
  const groupBeats = beamGroupBeats(meterCount, meterUnit)
  const result: string[] = []
  let group: Array<{ beats: number; xml: string }> = []
  let position = 0
  let groupStart = 0

  const flush = () => {
    if (group.length > 1) result.push(['<beam>', ...group.map(({ xml }) => xml), '</beam>'].join('\n'))
    else result.push(...group.map(({ xml }) => xml))
    group = []
  }

  for (const [index, item] of events.entries()) {
    if (item.prefix) {
      flush()
      result.push(item.prefix)
    }
    const graceEnd = item.xml.indexOf('</graceGrp>')
    const grace = graceEnd >= 0 ? item.xml.slice(0, graceEnd + '</graceGrp>'.length) : ''
    const xml = grace ? item.xml.slice(grace.length) : item.xml
    if (grace) {
      flush()
      result.push(grace)
    }
    const beamable = item.event.kind !== 'rest' && item.event.beats <= 0.75
    const remaining = groupBeats - position
    if (!beamable || item.event.beats > remaining + 0.0001) flush()

    if (beamable) {
      if (group.length === 0) groupStart = position
      group.push({ beats: item.event.beats, xml })
    }
    else result.push(xml)

    position = (position + item.event.beats) % groupBeats
    if (position < 0.0001 || groupBeats - position < 0.0001) {
      const next = events[index + 1]
      const canJoinStraightEighths = meterCount === 4 && meterUnit === 4 &&
        groupStart < 0.0001 &&
        group.reduce((total, { beats }) => total + beats, 0) < 2 - 0.0001 &&
        group.every(({ beats }) => Math.abs(beats - 0.5) < 0.0001) &&
        next?.event.kind !== 'rest' && Math.abs((next?.event.beats ?? 0) - 0.5) < 0.0001
      if (!canJoinStraightEighths) flush()
    }
  }
  flush()
  return result
}

export function m3nToMei(source: string): MeiConversionResult {
  const document = parseM3NDocument(source)
  const sourceMap: MeiSourceMapRange[] = []
  const hasBassStaff = [...document.parts.values()].some((part) => part.bass.some((measure) => measure.events.length > 0))
  let eventIndex = 0
  const eventIds = new Map<string, string>()
  const preassignedIds = new Map<DirectEvent, string>()
  const tempoChanges = buildTempoChanges(source)
  const tempoChangesBySource = new Map<number, TempoChange[]>()
  for (const change of tempoChanges) {
    if (change.sourceStart === undefined) continue
    const changes = tempoChangesBySource.get(change.sourceStart) ?? []
    changes.push(change)
    tempoChangesBySource.set(change.sourceStart, changes)
  }
  const previousTiedByStaff = new Map<number, boolean>()
  const previousKeyByStaff = new Map<number, string>()
  let previousMeter = { count: document.meterCount, unit: document.meterUnit }
  let tempoIndex = document.hasExplicitTempo ? 1 : 0
  const lyricSyllables = document.lyrics.map((block, index) => ({
    n: /^\d+$/.test(block.range) ? block.range : String(index + 1),
    verseIndex: index + 1,
    passes: block.range ? endingPasses(block.range) : undefined,
    syllables: splitLyricSyllables(block.syllables).map((syllable) => ({
      ...syllable,
      cjkSpacingCompensation: block.mode === 'char',
    })),
  }))
  const melodyIndices = lyricSyllables.map(() => 0)
  const lyricPassesByMeasure = new Map<DirectMeasure, Set<number>>()
  for (const part of document.parts.values()) {
    for (const [measure, passes] of measurePlaybackPasses(part.melody)) lyricPassesByMeasure.set(measure, passes)
  }
  const isInstrumentalEvent = (event: DirectEvent) => document.intervals.some((interval) => (
    interval.kind === 'inst' &&
    interval.staff === 'melody' &&
    interval.start !== undefined &&
    interval.end !== undefined &&
    interval.start <= event.sourceStart &&
    event.sourceEnd <= interval.end
  ))

  for (const part of document.parts.values()) {
    const measureCount = Math.max(part.melody.length, hasBassStaff ? part.bass.length : 0)
    for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
      for (const event of part.melody[measureIndex]?.events ?? []) {
        const xmlId = `m3n-e-${++eventIndex}`
        preassignedIds.set(event, xmlId)
        eventIds.set(`1:${event.sourceStart}`, xmlId)
      }
      for (const event of hasBassStaff ? part.bass[measureIndex]?.events ?? [] : []) {
        const xmlId = `m3n-e-${++eventIndex}`
        preassignedIds.set(event, xmlId)
        eventIds.set(`2:${event.sourceStart}`, xmlId)
      }
    }
  }

  const tiesByStartId = new Map<string, string[]>()
  const collectTies = (measures: DirectMeasure[]) => {
    let tiedEvent: DirectEvent | undefined
    for (const measure of measures) {
      for (const event of measure.events) {
        if (tiedEvent) {
          const startid = preassignedIds.get(tiedEvent)
          const endid = preassignedIds.get(event)
          if (startid && endid) {
            const ties = tiesByStartId.get(startid) ?? []
            ties.push(`<tie startid="#${startid}" endid="#${endid}"/>`)
            tiesByStartId.set(startid, ties)
          }
        }
        tiedEvent = event.tie ? event : undefined
      }
    }
  }
  for (const part of document.parts.values()) {
    collectTies(part.melody)
    if (hasBassStaff) collectTies(part.bass)
  }

  const renderStaff = (
    measure: DirectMeasure | undefined,
    staffNumber: number,
    keyChanges = new Map<number, string>(),
    meter = previousMeter,
  ) => {
    if (measure?.multiRest) {
      return `<staff n="${staffNumber}">\n  <layer n="1">\n      <multiRest num="${measure.multiRest}"/>\n  </layer>\n</staff>`
    }
    const events = measure?.events ?? []
    const accidentals = new Map<string, string>()
    const renderedEvents = events.map((event, eventIndex) => {
      const xmlId = preassignedIds.get(event) ?? `m3n-e-${++eventIndex}`
      eventIds.set(`${staffNumber}:${event.sourceStart}`, xmlId)
      sourceMap.push({ xmlId, sourceStart: event.sourceStart, sourceEnd: event.sourceEnd })
      if (event.kind === 'tuplet') {
        event.pitches.forEach((_, index) => {
          sourceMap.push({ xmlId: `${xmlId}-n${index + 1}`, sourceStart: event.sourceStart, sourceEnd: event.sourceEnd })
        })
      }
      const tieEnd = previousTiedByStaff.get(staffNumber) ?? false
      previousTiedByStaff.set(staffNumber, event.tie)
      const lyricTargetCount = event.kind === 'tuplet'
        ? event.pitches.filter((pitch) => pitch !== '0').length
        : 1
      const measurePasses = measure ? lyricPassesByMeasure.get(measure) : undefined
      const lyrics = staffNumber === 1 && event.kind !== 'rest' && !isInstrumentalEvent(event)
        ? lyricSyllables.flatMap((block, index) => Array.from({ length: lyricTargetCount }, (_, targetIndex) => {
          const passes = block.passes
          if (passes && measurePasses && ![...measurePasses].some((pass) => passes.has(pass))) return []
          const lyric = block.syllables[melodyIndices[index]]
          const tiedTarget = targetIndex === 0 && tieEnd
          if (!lyric || lyric.forceTiedTarget !== tiedTarget) return []
          melodyIndices[index] += 1
          return { ...lyric, n: block.n, verseIndex: block.verseIndex }
        }).flat())
        : []
      lyrics.forEach((lyric) => sourceMap.push({ xmlId, sourceStart: lyric.sourceStart, sourceEnd: lyric.sourceEnd }))
      const keySig = keyChanges.get(eventIndex)
      return { event, prefix: keySig ? `<keySig sig="${keySignature(keySig)}"/>` : undefined, xml: eventXml(event, xmlId, lyrics, accidentals) }
    })
    const body = beamXml(renderedEvents, meter.count, meter.unit)
      .map((xml) => xml.split('\n').map((line) => `      ${line}`).join('\n'))
      .join('\n') || '      <mSpace/>'
    return `<staff n="${staffNumber}">\n  <layer n="1">\n${body}\n  </layer>\n</staff>`
  }

  const keyChangesForMeasure = (measure: DirectMeasure | undefined, staffNumber: number) => {
    let key = previousKeyByStaff.get(staffNumber) ?? document.key
    const changes = new Map<number, string>()
    let openingKey: string | undefined
    for (const [eventIndex, event] of (measure?.events ?? []).entries()) {
      if (event.key !== key) {
        if (eventIndex === 0) openingKey = event.key
        else changes.set(eventIndex, event.key)
        key = event.key
      }
    }
    previousKeyByStaff.set(staffNumber, key)
    return { changes, openingKey }
  }

  const keyScoreDefXml = (key: string) => [
    '<scoreDef>',
    '  <staffGrp>',
    `    <staffDef n="1"><keySig sig="${keySignature(key)}"/></staffDef>`,
    ...(hasBassStaff ? [`    <staffDef n="2"><keySig sig="${keySignature(key)}"/></staffDef>`] : []),
    '  </staffGrp>',
    '</scoreDef>',
  ].join('\n')

  const meterScoreDefXml = (meter: { count: number; unit: number }) => [
    '<scoreDef>',
    '  <staffGrp>',
    `    <staffDef n="1" meter.count="${meter.count}" meter.unit="${meter.unit}"/>`,
    ...(hasBassStaff ? [`    <staffDef n="2" meter.count="${meter.count}" meter.unit="${meter.unit}"/>`] : []),
    '  </staffGrp>',
    '</scoreDef>',
  ].join('\n')

  const meterChangeForMeasure = (measure: DirectMeasure | undefined) => {
    let meter = previousMeter
    let openingMeter: typeof meter | undefined
    for (const [eventIndex, event] of (measure?.events ?? []).entries()) {
      const next = { count: event.meterCount ?? meter.count, unit: event.meterUnit ?? meter.unit }
      if (next.count !== meter.count || next.unit !== meter.unit) {
        if (eventIndex === 0) openingMeter = next
        meter = next
      }
    }
    previousMeter = meter
    return { meter, openingMeter }
  }

  const controlXml = (measure: DirectMeasure | undefined, staffNumber: number, meter = previousMeter) => {
    const events = measure?.events ?? []
    const idFor = (sourceStart: number | undefined) => sourceStart === undefined ? undefined : eventIds.get(`${staffNumber}:${sourceStart}`)
    const postfix = (xmlId: string, value: string) => {
      if (value === 'arp') return `<arpeg startid="#${xmlId}"/>`
      if (value === 'tr') return `<trill startid="#${xmlId}"/>`
      if (value === 'str' || value === 'tip') return ''
      if (value === 'fermata') return `<fermata startid="#${xmlId}"/>`
      if (value === 'breath') return `<breath startid="#${xmlId}"/>`
      if (/^f[1-5]$/.test(value)) return `<fing startid="#${xmlId}">${value.slice(1)}</fing>`
      return ''
    }
    const eventControls = events.flatMap((event) => {
      const xmlId = idFor(event.sourceStart)
      if (!xmlId) return []
      return [
        event.chord ? `<harm staff="${staffNumber}" startid="#${xmlId}">${chordSymbol(event.chord, event.key)}</harm>` : '',
        event.dynamic ? `<dynam staff="${staffNumber}" startid="#${xmlId}">${event.dynamic}</dynam>` : '',
        event.prefix ? `<dynam staff="${staffNumber}" startid="#${xmlId}">${event.prefix}</dynam>` : '',
        ...event.navigation.map((value) => {
          if (value === 'fine') return `<repeatMark staff="${staffNumber}" tstamp="${meter.count + 1}" place="above" func="fine">Fine</repeatMark>`
          const func = value === 'ds' ? 'dalSegno' : value === 'dc' ? 'daCapo' : value
          if (value === 'ds' || value === 'dc') return `<repeatMark staff="${staffNumber}" tstamp="${meter.count + 1}" place="above" func="${func}"/>`
          return `<repeatMark staff="${staffNumber}" startid="#${xmlId}" func="${func}"/>`
        }),
        ...event.postfixes.map((value) => postfix(xmlId, value)),
        ...(tiesByStartId.get(xmlId) ?? []),
      ].filter(Boolean)
    })
    const tempoControls = staffNumber === 1 ? events.flatMap((event) => {
      const xmlId = idFor(event.sourceStart)
      if (!xmlId) return []
      const changes = tempoChangesBySource.get(event.sourceStart) ?? []
      return [
        ...changes.filter((change) => !change.ramp).map((change) => tempoXml(change.tempo, event.meterUnit ?? document.meterUnit, `startid="#${xmlId}"`, `m3n-tempo-${++tempoIndex}`)),
      ].filter(Boolean)
    }) : []
    const first = events[0]?.sourceStart
    const last = events.at(-1)?.sourceEnd
    const intervalControls = document.intervals.flatMap((interval) => {
      if (interval.staff !== (staffNumber === 1 ? 'melody' : 'bass') || interval.start === undefined || interval.endStart === undefined) return []
      if (interval.start < (first ?? Infinity) || interval.start > (last ?? -Infinity)) return []
      const startid = idFor(interval.start)
      const endid = idFor(interval.endStart)
      if (!startid || !endid) return []
      if (staffNumber === 1 && (interval.kind === 'accel' || interval.kind === 'rit')) return [`<tempo staff="${staffNumber}" startid="#${startid}" endid="#${endid}" place="above" func="continuous">${interval.kind === 'rit' ? 'rit.' : 'accel.'}</tempo>`]
      if (interval.kind === 'lg') return [`<slur startid="#${startid}" endid="#${endid}"/>`]
      if (interval.kind === 'cresc' || interval.kind === 'decres') return [`<hairpin staff="${staffNumber}" form="${interval.kind === 'cresc' ? 'cres' : 'dim'}" startid="#${startid}" endid="#${endid}"/>`]
      if (interval.kind === '8va' || interval.kind === '8vb') return [`<octave staff="${staffNumber}" dis="8" dis.place="${interval.kind === '8va' ? 'above' : 'below'}" startid="#${startid}" endid="#${endid}"/>`]
      return []
    })
    return [...tempoControls, ...eventControls, ...intervalControls].map((xml) => `  ${xml}`).join('\n')
  }

  let segmentIndex = 0
  let endingIndex = 0
  let logicalMeasureNumber = 0
  const hasNavigation = [...document.parts.values()].some((part) => part.melody.some((measure) => measure.events.some((event) => event.navigation.length > 0)))
  const layoutNodes = [...document.parts.entries()].flatMap(([partName, part], partIndex) => {
    while (part.melody.length > 1 && part.melody.at(-1)?.events.length === 0 && !part.melody.at(-1)?.multiRest) {
      const trailing = part.melody.pop()
      if (trailing?.breakBefore || trailing?.breakAfter) part.melody.at(-1)!.breakAfter = true
    }
    while (part.bass.length > 1 && part.bass.at(-1)?.events.length === 0 && !part.bass.at(-1)?.multiRest) part.bass.pop()
    const measureCount = Math.max(part.melody.length, hasBassStaff ? part.bass.length : 0)
    let incompleteBoundaryMeasure: { beats: number; number: number; id: string; right?: string } | undefined
    const measures = Array.from({ length: measureCount }, (_, measureIndex) => {
      const melody = part.melody[measureIndex]
      const left = melody?.left ? ` left="${melody.left}"` : ''
      const right = melody?.right ? ` right="${melody.right}"` : ''
      const { changes: keyChanges, openingKey } = keyChangesForMeasure(melody, 1)
      const { meter, openingMeter } = meterChangeForMeasure(melody)
      const expectedBeats = meter.count * 4 / meter.unit
      const actualBeats = melody?.events.reduce((sum, event) => sum + event.beats, 0) ?? 0
      const measureId = `m3n-measure-${partIndex + 1}-${measureIndex + 1}`
      const priorIncompleteBoundary = incompleteBoundaryMeasure
      const completesBoundary = priorIncompleteBoundary
        && (priorIncompleteBoundary.right === 'rptend' || melody?.left === 'rptstart')
        && Math.abs(priorIncompleteBoundary.beats + actualBeats - expectedBeats) < 1e-9
        ? priorIncompleteBoundary
        : undefined
      const isIncomplete = Boolean(melody && Math.abs(actualBeats - expectedBeats) > 1e-9)
      const metcon = isIncomplete && !completesBoundary ? ' metcon="false"' : ''
      const join = completesBoundary ? ` join="#${completesBoundary.id}"` : ''
      const displayedNumber = completesBoundary?.number ?? ++logicalMeasureNumber
      incompleteBoundaryMeasure = isIncomplete
        ? { beats: actualBeats, number: displayedNumber, id: measureId, right: melody?.right }
        : undefined
      const staves = [
        renderStaff(melody, 1, keyChanges, meter),
        hasBassStaff ? renderStaff(part.bass[measureIndex], 2, keyChanges, meter) : '',
      ]
        .filter(Boolean).map((staff) => staff.split('\n').map((line) => `  ${line}`).join('\n')).join('\n')
      const controls = [controlXml(melody, 1, meter), hasBassStaff ? controlXml(part.bass[measureIndex], 2, meter) : ''].filter(Boolean).join('\n')
      const tempo = document.hasExplicitTempo && partIndex === 0 && measureIndex === 0
        ? `  ${tempoXml(document.tempo, document.meterUnit, 'tstamp="1"', 'm3n-tempo-1')}\n`
        : ''
      const partLabel = document.partOrder.length > 0 && measureIndex === 0
        ? `  <reh staff="1" tstamp="1"><rend fontweight="bold">${escapeXml(partName)}</rend></reh>\n`
        : ''
      const xml = `<measure xml:id="${measureId}" n="${displayedNumber}"${metcon}${join}${left}${right}>\n${tempo}${partLabel}${staves}${controls ? `\n${controls}` : ''}\n</measure>`
      return {
        ending: melody?.ending,
        repeatStart: melody?.left === 'rptstart',
        repeatCount: melody?.repeatCount ?? (melody?.right === 'rptend' ? 2 : undefined),
        navigation: melody?.events.flatMap((event) => event.navigation) ?? [],
        breakBefore: melody?.breakBefore,
        breakAfter: melody?.breakAfter,
        scoreDef: [openingKey ? keyScoreDefXml(openingKey) : '', openingMeter ? meterScoreDefXml(openingMeter) : ''].filter(Boolean).join('\n'),
        xml,
      }
    })
    const measureContent = (measure: (typeof measures)[number]) => [
      measure.breakBefore ? '<sb/>' : '',
      measure.scoreDef,
      measure.xml,
      measure.breakAfter ? '<sb/>' : '',
    ].filter(Boolean).join('\n')
    const nodes: Array<{ kind: 'section' | 'ending'; id: string; n?: string; partName: string; content: string; repeatStart?: boolean; repeatCount?: number; navigation?: string[] }> = []
    for (let index = 0; index < measures.length;) {
      const current = measures[index]
      const content: string[] = []
      if (current?.ending) {
        const ending = current.ending
        while (index < measures.length && measures[index]?.ending === ending) {
          content.push(measureContent(measures[index] as (typeof measures)[number]))
          index += 1
        }
        nodes.push({
          kind: 'ending', id: `m3n-ending-${++endingIndex}`, n: ending, partName, content: content.join('\n'),
          repeatCount: current?.repeatCount,
          navigation: measures.slice(index - content.length, index).flatMap((measure) => measure?.navigation ?? []),
        })
        continue
      }
      const sectionMeasures: typeof measures = []
      while (
        index < measures.length
        && !measures[index]?.ending
        && (content.length === 0 || (!measures[index]?.repeatStart && measures[index]?.navigation.length === 0))
      ) {
        const measure = measures[index] as (typeof measures)[number]
        sectionMeasures.push(measure)
        content.push(measureContent(measure))
        index += 1
        if (measure.repeatCount || measure.navigation.length > 0) break
      }
      nodes.push({ kind: 'section', id: `m3n-segment-${++segmentIndex}`, partName, content: content.join('\n'), repeatStart: sectionMeasures[0]?.repeatStart, repeatCount: sectionMeasures.at(-1)?.repeatCount, navigation: sectionMeasures.flatMap((measure) => measure.navigation) })
    }
    return nodes
  })
  const expandNodes = (nodes: typeof layoutNodes) => {
    const expansion: string[] = []
    let repeatStartIndex = 0
    for (let index = 0; index < nodes.length;) {
      const node = nodes[index]
      const endingStart = node?.kind === 'section'
        ? nodes.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.kind === 'ending', index + 1)
        : -1
      const repeatedSections = endingStart > index && (node?.repeatStart || endingStart === index + 1)
        ? nodes.slice(index, endingStart)
        : []
      let endingEnd = endingStart
      while (endingEnd >= 0 && nodes[endingEnd]?.kind === 'ending') endingEnd += 1
      const endings = endingStart >= 0 ? nodes.slice(endingStart, endingEnd) : []
      const hasRepeatEnd = endings.some((ending) => ending.repeatCount)
      if (repeatedSections.length > 0 && hasRepeatEnd) {
      const endingSets = endings.map((ending) => endingPasses(ending.n ?? ''))
      const passCount = Math.max(1, ...endingSets.flatMap((passes) => [...passes]), ...endings.map((ending) => ending.repeatCount ?? 0))
      const priorRepeat = expansion.slice(repeatStartIndex)
      for (let pass = 1; pass <= passCount; pass += 1) {
        if (pass === 1) expansion.push(...repeatedSections.map((section) => `#${section.id}`))
        else expansion.push(...priorRepeat, ...repeatedSections.map((section) => `#${section.id}`))
        const ending = endings[endingSets.findIndex((passes) => passes.has(pass))]
        if (ending) expansion.push(`#${ending.id}`)
      }
      repeatStartIndex = expansion.length
      index = endingEnd
      continue
    }
      if (node) {
        expansion.push(`#${node.id}`)
        if (node.repeatStart) repeatStartIndex = expansion.length - 1
        if (node.repeatCount) {
          const repeat = expansion.slice(repeatStartIndex)
          for (let pass = 1; pass < node.repeatCount; pass += 1) expansion.push(...repeat)
          repeatStartIndex = expansion.length
        }
      }
      index += 1
    }
    return expansion
  }
  const hasNamedParts = document.partOrder.length > 0
  const hasEndings = layoutNodes.some((node) => node.kind === 'ending')
  let expansion = hasNamedParts
    ? document.partOrder.flatMap((partName) => expandNodes(layoutNodes.filter((node) => node.partName === partName)))
    : expandNodes(layoutNodes)
  const jumpNode = layoutNodes.find((node) => node.navigation?.includes('ds') || node.navigation?.includes('dc'))
  if (jumpNode) {
    const jumpIndex = expansion.lastIndexOf(`#${jumpNode.id}`)
    const destination = jumpNode.navigation?.includes('ds')
      ? layoutNodes.find((node) => node.navigation?.includes('segno'))
      : layoutNodes.find((node) => node.kind === 'section')
    const fine = layoutNodes.find((node) => node.navigation?.includes('fine'))
    const destinationIndex = destination ? layoutNodes.indexOf(destination) : -1
    const jumpNodeIndex = layoutNodes.indexOf(jumpNode)
    let returnEndIndex = fine ? layoutNodes.indexOf(fine) : jumpNodeIndex
    let returnPass: number | undefined
    if (!fine) {
      let endingStart = jumpNodeIndex
      while (layoutNodes[endingStart - 1]?.kind === 'ending') endingStart -= 1
      let endingEnd = jumpNodeIndex + 1
      while (layoutNodes[endingEnd]?.kind === 'ending') endingEnd += 1
      const endings = layoutNodes.slice(endingStart, endingEnd)
      const highestPass = Math.max(0, ...endings.flatMap((ending) => [...endingPasses(ending.n ?? '')]))
      if (highestPass > 0) {
        returnPass = highestPass
        const matchingEnding = endings.find((ending) => endingPasses(ending.n ?? '').has(highestPass))
        if (matchingEnding) returnEndIndex = layoutNodes.indexOf(matchingEnding)
      }
    }
    if (jumpIndex >= 0 && destinationIndex >= 0 && returnEndIndex >= destinationIndex) {
      // Repeat marks apply on the initial pass. A D.S./D.C. return is a
      // linear navigation path and must not re-trigger already played repeats.
      const returnPath = layoutNodes.slice(destinationIndex, returnEndIndex + 1).flatMap((node) => {
        if (node.kind !== 'ending') return `#${node.id}`
        return !returnPass || endingPasses(node.n ?? '').has(returnPass) ? `#${node.id}` : []
      })
      expansion = [...expansion.slice(0, jumpIndex + 1), ...returnPath]
    }
  }
  const needsExpansion = hasNamedParts || hasEndings || hasNavigation || layoutNodes.some((node) => node.repeatCount)
  const sectionContent = [
    ...(needsExpansion ? [`<expansion xml:id="m3n-expansion" plist="${expansion.join(' ')}"/>`] : []),
    ...layoutNodes.map((node) => !needsExpansion ? node.content
      : node.kind === 'ending'
        ? `<ending xml:id="${node.id}" n="${escapeXml(node.n ?? '')}">\n${node.content}\n</ending>`
        : `<section xml:id="${node.id}">\n${node.content}\n</section>`),
  ].join('\n')
  const headerMetadata: ScoreHeaderMetadata[] = ([
    { value: document.title, side: 'center', priority: 0 },
    { value: document.subtitle, side: 'center', priority: 10 },
    { value: document.singer || document.composer, side: 'right', priority: 20 },
    { value: document.partOrder.join(' → '), side: 'left', priority: 30 },
  ] satisfies ScoreHeaderMetadata[]).filter((item) => item.value)

  const responsibility = [
    document.singer ? ['singer', document.singer, 'Singer'] : null,
    document.composer ? ['composer', document.composer, 'Composer'] : null,
    document.lyricist ? ['lyricist', document.lyricist, 'Lyricist'] : null,
    document.arranger ? ['arranger', document.arranger, 'Arranger'] : null,
  ].filter((item): item is string[] => Boolean(item)).flatMap(([role, name, label]) => [
    '        <respStmt>', `          <persName role="${role}">${escapeXml(name)}</persName>`,
    `          <resp>${label}</resp>`, '        </respStmt>',
  ])
  const signature = keySignature(document.key)
  const staffDefs = [
    `<staffGrp symbol="${hasBassStaff ? 'brace' : 'none'}" bar.thru="true">`,
    `  <staffDef n="1" lines="5" clef.shape="G" clef.line="2" meter.count="${document.meterCount}" meter.unit="${document.meterUnit}" midi.instrnum="0"><keySig sig="${signature}"/></staffDef>`,
    ...(hasBassStaff ? [`  <staffDef n="2" lines="5" clef.shape="F" clef.line="4" meter.count="${document.meterCount}" meter.unit="${document.meterUnit}" midi.instrnum="0"><keySig sig="${signature}"/></staffDef>`] : []),
    '</staffGrp>',
  ]
  const mei = [
    '<?xml version="1.0" encoding="UTF-8"?>', '<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">',
    '  <meiHead>', '    <fileDesc>', '      <titleStmt>',
    `        <title type="main">${escapeXml(document.title)}</title>`,
    ...(document.subtitle ? [`        <title type="subordinate">${escapeXml(document.subtitle)}</title>`] : []),
    ...responsibility, '      </titleStmt>', '      <pubStmt/>',
    ...(document.source ? ['      <sourceDesc>', `        <source><bibl>${escapeXml(document.source)}</bibl></source>`, '      </sourceDesc>'] : []),
    '    </fileDesc>', '  </meiHead>',
    '  <music>', '    <body>', '      <mdiv>', '        <score>',
    `          <scoreDef midi.bpm="${document.tempo}">`,
    ...staffDefs.map((line) => `            ${line}`), '          </scoreDef>', '          <section xml:id="m3n-score-section">',
    ...sectionContent.split('\n').map((line) => `            ${line}`),
    '          </section>', '        </score>', '      </mdiv>', '    </body>', '  </music>', '</mei>',
  ].join('\n')
  return {
    source, mei, diagnostics: validateM3N(source), sourceMap,
    title: document.title, subtitle: document.subtitle, singer: document.singer, composer: document.composer,
    lyricist: document.lyricist, arranger: document.arranger, hasBassStaff,
    partOrder: document.partOrder,
    headerMetadata,
    accompaniment: buildAccompaniment(source),
    tempoChanges,
    tempo: document.tempo,
  }
}
