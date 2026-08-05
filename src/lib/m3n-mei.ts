import { parseM3NDocument } from './m3n-direct'
import { m3nChord } from './m3n-harmony'
import {
  meiBeamXml as renderBeamXml,
  meiEventXml as renderEventXml,
  meiTempoXml as renderTempoXml,
} from './mei-events'
import { measurePlaybackPasses, parsePassRange } from './notation/repeats'
import { validateM3NDiagnostics } from './m3n-validate'
import type { ScoreDiagnostic } from './notation/diagnostics'
import type { ScoreDocument, ScoreEvent, ScoreMeasure } from './notation/score-document'
import { needsCjkSpacingCompensation } from './notation/mei-lyrics'
import { escapeXml } from './notation/mei-xml'
import { projectM3NDocument, type M3NDocumentProjection } from './notation/m3n-document'
import { parseM3NSyntaxTree, type M3NSyntaxTree } from './notation/syntax-tree'
import { meiDocumentXml, meiKeySignature, scoreHeaderMetadata, type ScoreHeaderMetadata } from './notation/mei-document'
import { meiSectionContent, type MeiLayoutNode } from './notation/mei-layout'

export type { ScoreHeaderMetadata } from './notation/mei-document'

export type MeiSourceMapRange = { xmlId: string; sourceStart: number; sourceEnd: number }
export type MeiConversionResult = {
  source: string
  mei: string
  diagnostics: ScoreDiagnostic[]
  sourceMap: MeiSourceMapRange[]
  title: string
  subtitle: string
  singer: string
  composer: string
  lyricist: string
  arranger: string
  hasBassStaff: boolean
  headerMetadata: ScoreHeaderMetadata[]
  tempo: number
}

function chordSymbol(value: string, key: string) {
  return m3nChord(value, key)?.symbol ?? value
}

export function m3nToMei(source: string, suppliedDocument?: ScoreDocument, context: { projection?: M3NDocumentProjection; syntaxTree?: M3NSyntaxTree } = {}): MeiConversionResult {
  const syntaxTree = context.syntaxTree ?? parseM3NSyntaxTree(source)
  const projection = context.projection ?? projectM3NDocument(source, syntaxTree)
  const document = suppliedDocument ?? parseM3NDocument(source, projection)
  const sourceMap: MeiSourceMapRange[] = []
  const hasBassStaff = [...document.parts.values()].some((part) => part.bass.some((measure) => measure.events.length > 0))
  let eventIndex = 0
  const eventIds = new Map<string, string>()
  const preassignedIds = new Map<ScoreEvent, string>()
  const previousTiedByStaff = new Map<number, boolean>()
  const previousKeyByStaff = new Map<number, string>()
  let previousMeter = { count: document.meterCount, unit: document.meterUnit }
  let previousTempo = document.tempo
  let tempoIndex = document.hasExplicitTempo ? 1 : 0
  const lyricSyllables = document.lyrics.map((block) => {
    const numericRange = /^\d+$/.test(block.range)
    const passRange = block.range || block.phrasePasses
    const passes = passRange ? parsePassRange(passRange) : undefined
    const displayPass = !numericRange && passes?.size === 1 ? [...passes][0] : undefined
    return {
      n: numericRange ? block.range : String(displayPass ?? 1),
      verseIndex: numericRange ? Number(block.range) : displayPass ?? 1,
      targetStart: block.targetStart,
      targetEnd: block.targetEnd,
      passes,
      syllables: block.syllables.map((syllable) => ({
        ...syllable,
        passes,
        cjkSpacingCompensation: needsCjkSpacingCompensation(syllable.text),
      })),
    }
  })
  const lyricRowCount = Math.max(0, ...lyricSyllables.map((block) => Number(block.n)).filter(Number.isInteger))
  const melodyIndices = lyricSyllables.map(() => 0)
  const lyricPassesByMeasure = new Map<ScoreMeasure, Set<number>>()
  for (const part of document.parts.values()) {
    for (const [measure, passes] of measurePlaybackPasses(part.melody)) lyricPassesByMeasure.set(measure, passes)
  }
  const isInstrumentalEvent = (event: ScoreEvent) => document.intervals.some((interval) => (
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

  const tiesByStartEvent = new Map<ScoreEvent, string[]>()
  const collectTies = (measures: ScoreMeasure[]) => {
    const addTie = (tiedEvent: ScoreEvent, event: ScoreEvent) => {
      const tiedEventId = preassignedIds.get(tiedEvent)
      const eventId = preassignedIds.get(event)
      const startid = tiedEventId && tiedEvent.tieFromTupletIndex !== undefined
        ? `${tiedEventId}-n${tiedEvent.tieFromTupletIndex + 1}`
        : tiedEventId
      const endid = eventId && event.kind === 'tuplet' ? `${eventId}-n1` : eventId
      if (!startid || !endid) return
      const ties = tiesByStartEvent.get(tiedEvent) ?? []
      const tie = `<tie startid="#${startid}" endid="#${endid}"/>`
      if (!ties.includes(tie)) ties.push(tie)
      tiesByStartEvent.set(tiedEvent, ties)
    }
    let tiedEvent: ScoreEvent | undefined
    for (const measure of measures) {
      for (const event of measure.events) {
        if (tiedEvent) addTie(tiedEvent, event)
        tiedEvent = event.tie ? event : undefined
      }
    }
  }
  for (const part of document.parts.values()) {
    collectTies(part.melody)
    if (hasBassStaff) collectTies(part.bass)
  }

  const compactLyricRowsInEnding = new Set<ScoreMeasure>()
  for (const part of document.parts.values()) {
    for (let index = 1; index < part.melody.length; index += 1) {
      const ending = part.melody[index]
      const previous = part.melody[index - 1]
      if (!ending?.ending || !previous?.ending || ending.ending === previous.ending) continue
      const laterCommonUsesMultipleRows = part.melody.slice(index).some((measure) => (
        !measure?.ending && measure?.events.some((event) => Math.max(0, ...lyricSyllables
          .filter((block) => block.targetStart === undefined || (
            block.targetStart <= event.sourceStart && event.sourceStart < (block.targetEnd ?? Infinity)
          ))
          .map((block) => block.verseIndex)) > 1)
      ))
      if (laterCommonUsesMultipleRows) continue
      for (let endingIndex = index; part.melody[endingIndex]?.ending === ending.ending; endingIndex += 1) {
        compactLyricRowsInEnding.add(part.melody[endingIndex]!)
      }
    }
  }

  const renderStaff = (
    measure: ScoreMeasure | undefined,
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
      const lyricBlocksAtEvent = lyricSyllables.filter((block) => (
        (block.targetStart === undefined || block.targetStart <= event.sourceStart)
        && (block.targetEnd === undefined || event.sourceStart < block.targetEnd)
        && (!block.passes || !measurePasses || [...measurePasses].some((pass) => block.passes?.has(pass)))
      ))
      const hasLyricTarget = staffNumber === 1 && event.kind !== 'rest' && !isInstrumentalEvent(event)
      const assignedLyrics = hasLyricTarget
        ? lyricBlocksAtEvent.flatMap((block) => Array.from({ length: lyricTargetCount }, (_, targetIndex) => {
          const index = lyricSyllables.indexOf(block)
          const lyricIndex = melodyIndices[index] ?? 0
          const lyric = block.syllables[lyricIndex]
          const tiedTarget = targetIndex === 0 && tieEnd
          if (!lyric || lyric.forceTiedTarget !== tiedTarget) return []
          melodyIndices[index] = lyricIndex + 1
          return { ...lyric, n: block.n, verseIndex: block.verseIndex }
        }).flat())
        : []
      const lyrics = hasLyricTarget
        ? lyricBlocksAtEvent.flatMap((block) => {
          const matched = assignedLyrics.filter((lyric) => lyric.verseIndex === block.verseIndex)
          if (matched.length > 0) return matched
          return [{
            text: '',
            sourceStart: event.sourceStart,
            sourceEnd: event.sourceEnd,
            forceTiedTarget: false,
            kind: 'placeholder' as const,
            underlined: false,
            n: block.n,
            verseIndex: block.verseIndex,
            passes: block.passes,
            cjkSpacingCompensation: false,
          }]
        })
        : []
      if (hasLyricTarget && !measure?.ending) {
        const occupiedRows = new Set(lyrics.map((lyric) => lyric.verseIndex))
        const reservesForcedCjkSpace = lyrics.some((lyric) => lyric.forceTiedTarget && needsCjkSpacingCompensation(lyric.text))
        if (reservesForcedCjkSpace) {
          for (const lyric of lyrics) {
            if (lyric.kind === 'placeholder') lyric.cjkSpacingCompensation = true
          }
        }
        const hasScopedLyrics = lyricBlocksAtEvent.some((block) => block.targetStart !== undefined)
        const remainingLyricRowCount = Math.max(0, ...lyricSyllables
          .filter((block) => block.targetEnd === undefined || event.sourceStart < block.targetEnd)
          .map((block) => block.verseIndex))
        const partLyricRowCount = hasScopedLyrics ? remainingLyricRowCount : lyricRowCount
        for (let row = 1; row <= partLyricRowCount; row += 1) {
          if (occupiedRows.has(row)) continue
          lyrics.push({
            text: '',
            sourceStart: event.sourceStart,
            sourceEnd: event.sourceEnd,
            forceTiedTarget: false,
            kind: 'placeholder',
            underlined: false,
            n: String(row),
            verseIndex: row,
            passes: undefined,
            cjkSpacingCompensation: reservesForcedCjkSpace,
          })
        }
        lyrics.sort((left, right) => left.verseIndex - right.verseIndex)
      }
      if (measure && compactLyricRowsInEnding.has(measure)) {
        const visualRows = new Map<number, number>()
        for (const lyric of lyrics) {
          const row = visualRows.get(lyric.verseIndex) ?? visualRows.size + 1
          visualRows.set(lyric.verseIndex, row)
          lyric.n = String(row)
          lyric.verseIndex = row
        }
      }
      lyrics.forEach((lyric) => sourceMap.push({ xmlId, sourceStart: lyric.sourceStart, sourceEnd: lyric.sourceEnd }))
      const keySig = keyChanges.get(eventIndex)
      return { event, prefix: keySig ? `<keySig sig="${meiKeySignature(keySig)}"/>` : undefined, xml: renderEventXml(event, xmlId, lyrics, accidentals) }
    })
    const body = renderBeamXml(renderedEvents, meter.count, meter.unit)
      .map((xml) => xml.split('\n').map((line) => `      ${line}`).join('\n'))
      .join('\n') || '      <mSpace/>'
    return `<staff n="${staffNumber}">\n  <layer n="1">\n${body}\n  </layer>\n</staff>`
  }

  const keyChangesForMeasure = (measure: ScoreMeasure | undefined, staffNumber: number) => {
    let key = previousKeyByStaff.get(staffNumber) ?? document.key
    const previousKey = key
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
    return { changes, openingKey, previousKey }
  }

  const cancellingKeySigXml = (key: string, previousKey: string) => {
    const nextSignature = meiKeySignature(key)
    const previousSignature = meiKeySignature(previousKey)
    const match = /^(\d+)([sf])$/.exec(previousSignature)
    if (nextSignature !== '0' || !match) return `<keySig sig="${nextSignature}"/>`
    const order = match[2] === 's' ? ['f', 'c', 'g', 'd', 'a', 'e', 'b'] : ['b', 'e', 'a', 'd', 'g', 'c', 'f']
    const accidentals = order.slice(0, Number(match[1])).map((pname) => `<keyAccid pname="${pname}" accid="n"/>`).join('')
    return `<keySig sig="0">${accidentals}</keySig>`
  }

  const keyScoreDefXml = (key: string, previousKey: string) => [
    '<scoreDef>',
    '  <staffGrp>',
    `    <staffDef n="1">${cancellingKeySigXml(key, previousKey)}</staffDef>`,
    ...(hasBassStaff ? [`    <staffDef n="2">${cancellingKeySigXml(key, previousKey)}</staffDef>`] : []),
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

  const meterChangeForMeasure = (measure: ScoreMeasure | undefined) => {
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

  const controlXml = (measure: ScoreMeasure | undefined, staffNumber: number, meter = previousMeter) => {
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
        event.sectionLabel ? `<reh staff="${staffNumber}" startid="#${xmlId}"><rend fontweight="bold">${escapeXml(event.sectionLabel)}</rend></reh>` : '',
        event.dynamic ? `<dynam staff="${staffNumber}" startid="#${xmlId}">${event.dynamic}</dynam>` : '',
        event.prefix ? `<dynam staff="${staffNumber}" startid="#${xmlId}">${event.prefix}</dynam>` : '',
        ...event.navigation.map((value) => {
          if (value === 'fine') return `<repeatMark staff="${staffNumber}" tstamp="${meter.count + 1}" place="above" func="fine">Fine</repeatMark>`
          const func = value === 'ds' ? 'dalSegno' : value === 'dc' ? 'daCapo' : value
          if (value === 'ds' || value === 'dc') return `<repeatMark staff="${staffNumber}" tstamp="${meter.count + 1}" place="above" func="${func}"/>`
          return `<repeatMark staff="${staffNumber}" startid="#${xmlId}" func="${func}"/>`
        }),
        ...event.postfixes.map((value) => postfix(xmlId, value)),
        ...(tiesByStartEvent.get(event) ?? []),
      ].filter(Boolean)
    })
    const navigationControls = staffNumber === 1 ? (measure?.navigation ?? []).map((value) => {
      const func = value === 'ds' ? 'dalSegno' : value === 'dc' ? 'daCapo' : value
      const lastEventId = idFor(events.at(-1)?.sourceStart)
      const anchor = value === 'segno'
        ? 'tstamp="1"'
        : lastEventId ? `startid="#${lastEventId}"` : `tstamp="${meter.count}"`
      const label = value === 'fine' ? 'Fine' : ''
      return `<repeatMark staff="${staffNumber}" ${anchor} place="above" func="${func}">${label}</repeatMark>`
    }) : []
    const tempoControls = staffNumber === 1 ? events.flatMap((event) => {
      if (event.tempo === undefined || event.tempo === previousTempo) return []
      previousTempo = event.tempo
      const followsRamp = document.intervals.some((interval) => interval.tempoTarget === event.tempo &&
        interval.end !== undefined && interval.end < event.sourceStart)
      if (followsRamp) return []
      const xmlId = idFor(event.sourceStart)
      return xmlId ? [renderTempoXml(event.tempo, event.meterUnit ?? document.meterUnit, `startid="#${xmlId}"`, `m3n-tempo-${++tempoIndex}`)] : []
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
      if (interval.kind === 'cresc' || interval.kind === 'decres') {
        if (interval.display === 'text') {
          const label = interval.kind === 'cresc' ? 'cresc.' : 'dim.'
          return [`<dir staff="${staffNumber}" startid="#${startid}" endid="#${endid}" place="above" type="${interval.kind}">${label}</dir>`]
        }
        return [`<hairpin staff="${staffNumber}" form="${interval.kind === 'cresc' ? 'cres' : 'dim'}" startid="#${startid}" endid="#${endid}"/>`]
      }
      if (interval.kind === '8va' || interval.kind === '8vb') return [`<octave staff="${staffNumber}" dis="8" dis.place="${interval.kind === '8va' ? 'above' : 'below'}" startid="#${startid}" endid="#${endid}"/>`]
      return []
    })
    return [...tempoControls, ...eventControls, ...navigationControls, ...intervalControls].map((xml) => `  ${xml}`).join('\n')
  }

  let segmentIndex = 0
  let endingIndex = 0
  let measureNumber = 0
  const hasNavigation = [...document.parts.values()].some((part) => part.melody.some((measure) =>
    Boolean(measure.navigation?.length) || measure.events.some((event) => event.navigation.length > 0)))
  const layoutNodes = [...document.parts.values()].flatMap((part, partIndex) => {
    while (part.melody.length > 1 && part.melody.at(-1)?.events.length === 0 && !part.melody.at(-1)?.multiRest) {
      const trailing = part.melody.pop()
      const previous = part.melody.at(-1)
      if (previous && (trailing?.breakBefore || trailing?.breakAfter)) previous.breakAfter = true
    }
    while (part.bass.length > 1 && part.bass.at(-1)?.events.length === 0 && !part.bass.at(-1)?.multiRest) part.bass.pop()
    const measureCount = Math.max(part.melody.length, hasBassStaff ? part.bass.length : 0)
    const measures = Array.from({ length: measureCount }, (_, measureIndex) => {
      const melody = part.melody[measureIndex]
      const left = melody?.left ? ` left="${melody.left}"` : ''
      const right = melody?.right ? ` right="${melody.right}"` : ''
      const { changes: keyChanges, openingKey, previousKey } = keyChangesForMeasure(melody, 1)
      const { meter, openingMeter } = meterChangeForMeasure(melody)
      const expectedBeats = meter.count * 4 / meter.unit
      const actualBeats = melody?.multiRest
        ? expectedBeats
        : melody?.events.reduce((sum, event) => sum + event.beats, 0) ?? 0
      const measureId = `m3n-measure-${partIndex + 1}-${measureIndex + 1}`
      const isIncomplete = Boolean(melody && Math.abs(actualBeats - expectedBeats) > 1e-9)
      const metcon = isIncomplete ? ' metcon="false"' : ''
      measureNumber += 1
      const staves = [
        renderStaff(melody, 1, keyChanges, meter),
        hasBassStaff ? renderStaff(part.bass[measureIndex], 2, keyChanges, meter) : '',
      ]
        .filter(Boolean).map((staff) => staff.split('\n').map((line) => `  ${line}`).join('\n')).join('\n')
      const controls = [controlXml(melody, 1, meter), hasBassStaff ? controlXml(part.bass[measureIndex], 2, meter) : ''].filter(Boolean).join('\n')
      const tempo = document.hasExplicitTempo && partIndex === 0 && measureIndex === 0
        ? `  ${renderTempoXml(document.tempo, document.meterUnit, 'tstamp="1"', 'm3n-tempo-1')}\n`
        : ''
      const xml = `<measure xml:id="${measureId}" n="${measureNumber}"${metcon}${left}${right}>\n${tempo}${staves}${controls ? `\n${controls}` : ''}\n</measure>`
      return {
        ending: melody?.ending,
        repeatStart: melody?.left === 'rptstart',
        repeatCount: melody?.repeatCount ?? (melody?.right === 'rptend' ? 2 : undefined),
        navigation: melody?.navigation ?? melody?.events.flatMap((event) => event.navigation) ?? [],
        breakBefore: melody?.breakBefore,
        breakAfter: melody?.breakAfter,
        scoreDef: [openingKey ? keyScoreDefXml(openingKey, previousKey) : '', openingMeter ? meterScoreDefXml(openingMeter) : ''].filter(Boolean).join('\n'),
        xml,
      }
    })
    const measureContent = (measure: (typeof measures)[number]) => [
      measure.breakBefore ? '<sb/>' : '',
      measure.scoreDef,
      measure.xml,
      measure.breakAfter ? '<sb/>' : '',
    ].filter(Boolean).join('\n')
    const nodes: MeiLayoutNode[] = []
    for (let index = 0; index < measures.length;) {
      const current = measures[index]
      const content: string[] = []
      if (current?.ending) {
        const ending = current.ending
        const endingStart = index
        while (index < measures.length && measures[index]?.ending === ending) {
          content.push(measureContent(measures[index] as (typeof measures)[number]))
          index += 1
        }
        nodes.push({
          kind: 'ending', id: `m3n-ending-${++endingIndex}`, n: ending, content: content.join('\n'),
          repeatCount: measures[index - 1]?.repeatCount,
          navigation: measures.slice(endingStart, index).flatMap((measure) => measure?.navigation ?? []),
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
      nodes.push({ kind: 'section', id: `m3n-segment-${++segmentIndex}`, content: content.join('\n'), repeatStart: sectionMeasures[0]?.repeatStart, repeatCount: sectionMeasures.at(-1)?.repeatCount, navigation: sectionMeasures.flatMap((measure) => measure.navigation) })
    }
    return nodes
  })
  const sectionContent = meiSectionContent(layoutNodes, hasNavigation)
  const headerMetadata = scoreHeaderMetadata(document)
  const mei = meiDocumentXml(document, sectionContent, hasBassStaff)
  const diagnostics = validateM3NDiagnostics(source, {}, document, { syntaxTree, projection })
  return {
    source, mei, diagnostics, sourceMap,
    title: document.title, subtitle: document.subtitle, singer: document.singer, composer: document.composer,
    lyricist: document.lyricist, arranger: document.arranger, hasBassStaff,
    headerMetadata,
    tempo: document.tempo,
  }
}
