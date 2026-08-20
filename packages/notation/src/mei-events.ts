import { m3nPitch } from './m3n-direct.js' 
import { parseM3NGrace, parseM3NGroupPitches } from './notation/m3n-groups.js'
import type { ScoreEvent } from './notation/score-document.js'
import { meiVerseXml, type MeiVerseSyllable } from './notation/mei-lyrics.js'
import { meiDurationAttributes } from './notation/mei-xml.js'

export type RenderedMeiEvent = { event: ScoreEvent; prefix?: string; xml: string }

const metronomeGlyphs: Record<number, { name: string; num: string }> = {
  1: { name: 'metNoteWhole', num: 'U+ECA2' }, 2: { name: 'metNoteHalfUp', num: 'U+ECA3' },
  4: { name: 'metNoteQuarterUp', num: 'U+ECA5' }, 8: { name: 'metNote8thUp', num: 'U+ECA7' },
  16: { name: 'metNote16thUp', num: 'U+ECA9' }, 32: { name: 'metNote32ndUp', num: 'U+ECAB' },
  64: { name: 'metNote64thUp', num: 'U+ECAD' },
}

function pitchXml(pitch: string, key: string, accidentals?: Map<string, string>, octaveShift = 0) {
  const value = m3nPitch(pitch, key)
  const octave = value.oct + octaveShift
  const accidentalKey = `${value.pname}${octave}`
  if (value.accid) accidentals?.set(accidentalKey, value.accidGes ?? value.accid)
  const accidGes = value.accid ? value.accidGes : accidentals?.get(accidentalKey) || value.accidGes
  return `pname="${value.pname}" oct="${octave}"${value.accid ? ` accid="${value.accid}"` : ''}${accidGes ? ` accid.ges="${accidGes}"` : ''}`
}

export function meiTempoXml(qpm: number, meterUnit: number, position: string, id: string) {
  const glyph = metronomeGlyphs[meterUnit] ?? metronomeGlyphs[4]!
  const bpm = qpm / (4 / meterUnit)
  const value = Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(2).replace(/\.00$|0$/g, '')
  const note = `<rend glyph.auth="smufl" glyph.name="${glyph.name}" glyph.num="${glyph.num}">&#x${glyph.num.slice(2)};</rend>`
  return `<tempo xml:id="${id}" staff="1" ${position} midi.bpm="${qpm}">${note} = ${value}</tempo>`
}

export function meiEventXml(
  event: ScoreEvent,
  xmlId: string,
  lyrics: MeiVerseSyllable[],
  accidentals?: Map<string, string>,
  visibleVerseIndexes?: ReadonlySet<number>,
  tieTarget = false,
) {
  const verse = meiVerseXml(lyrics, xmlId, visibleVerseIndexes)
  const articulations = [
    event.postfixes.includes('str') ? '<artic artic="acc"/>' : '', event.postfixes.includes('brk') ? '<artic artic="stacciss"/>' : '',
    event.postfixes.includes('tip') ? '<artic artic="stacc"/>' : '', event.postfixes.includes('hold') ? '<artic artic="ten"/>' : '',
  ].join('')
  const graces = event.postfixes.flatMap((value) => {
    const parsed = parseM3NGrace(value)
    if (!parsed) return []
    const duration = 2 ** (parsed.depth + 2)
    const notes = (parseM3NGroupPitches(parsed.pitchSource) ?? []).map((pitch) =>
      `<note ${pitchXml(pitch, event.key)} dur="${duration}" grace="${parsed.kind === 'ac' ? 'unacc' : 'acc'}"/>`)
    const content = notes.length > 1 ? `<beam>${notes.join('')}</beam>` : notes.join('')
    return content ? [`<graceGrp attach="pre">${content}</graceGrp>`] : []
  }).join('')
  if (event.kind === 'rest') return `<rest xml:id="${xmlId}" ${meiDurationAttributes(event.beats)}/>`
  if (event.kind === 'chord') {
    const notes = event.pitches.map((pitch, index) => {
      const tie = event.tie ? 'i' : tieTarget ? 't' : undefined
      return `<note xml:id="${xmlId}-n${index + 1}" ${pitchXml(pitch, event.key, accidentals)}${tie ? ` tie="${tie}"` : ''}/>`
    }).join('')
    return `${graces}<chord xml:id="${xmlId}" ${meiDurationAttributes(event.beats)}>${notes}${articulations}${verse}</chord>`
  }
  if (event.kind === 'tuplet' && event.tuplet) {
    const childBeats = event.tuplet.unitBeats
    const lyricsByVerse = new Map<number, MeiVerseSyllable[]>()
    for (const lyric of lyrics) lyricsByVerse.set(lyric.verseIndex, [...(lyricsByVerse.get(lyric.verseIndex) ?? []), lyric])
    let lyricTargetIndex = 0
    const children = event.pitches.map((pitch, index) => {
      if (pitch === '0') return `<rest xml:id="${xmlId}-n${index + 1}" ${meiDurationAttributes(childBeats)}/>`
      const childId = `${xmlId}-n${index + 1}`
      const childLyrics = [...lyricsByVerse.values()].map((items) => items[lyricTargetIndex]).filter((lyric): lyric is MeiVerseSyllable => lyric !== undefined)
      lyricTargetIndex += 1
      const note = `<note xml:id="${childId}" ${pitchXml(pitch, event.key, accidentals)} ${meiDurationAttributes(childBeats)}`
      const childVerse = meiVerseXml(childLyrics, childId, visibleVerseIndexes)
      return childVerse ? `${note}>${childVerse}</note>` : `${note}/>`
    }).join('')
    const content = childBeats <= 0.5 && !event.pitches.includes('0') ? `<beam>${children}</beam>` : children
    return `<tuplet xml:id="${xmlId}" num="${event.tuplet.num}" numbase="${event.tuplet.numbase}">${content}</tuplet>`
  }
  return `${graces}<note xml:id="${xmlId}" ${pitchXml(event.pitches[0] ?? '1', event.key, accidentals)} ${meiDurationAttributes(event.beats)}>${articulations}${verse}</note>`
}

export function meiBeamXml(events: RenderedMeiEvent[], meterCount: number, meterUnit: number) {
  const groupBeats = (4 / meterUnit) * (meterUnit >= 8 && meterCount % 3 === 0 ? 3 : 1)
  const result: string[] = []
  let group: Array<{ beats: number; xml: string }> = []
  let position = 0
  let groupStart = 0
  const flush = () => { if (group.length > 1) result.push(['<beam>', ...group.map(({ xml }) => xml), '</beam>'].join('\n')); else result.push(...group.map(({ xml }) => xml)); group = [] }
  for (const [index, item] of events.entries()) {
    if (item.prefix) { flush(); result.push(item.prefix) }
    const graceEnd = item.xml.indexOf('</graceGrp>')
    const grace = graceEnd >= 0 ? item.xml.slice(0, graceEnd + '</graceGrp>'.length) : ''
    const xml = grace ? item.xml.slice(grace.length) : item.xml
    if (grace) { flush(); result.push(grace) }
    const beamable = item.event.kind !== 'rest' && item.event.beats <= 0.75
    if (!beamable || item.event.beats > groupBeats - position + 0.0001) flush()
    if (beamable) { if (group.length === 0) groupStart = position; group.push({ beats: item.event.beats, xml }) } else result.push(xml)
    position = (position + item.event.beats) % groupBeats
    if (position < 0.0001 || groupBeats - position < 0.0001) {
      const next = events[index + 1]
      const joinsEighths = meterCount === 4 && meterUnit === 4 && groupStart < 0.0001 && group.reduce((total, item) => total + item.beats, 0) < 2 - 0.0001 && group.every((item) => Math.abs(item.beats - 0.5) < 0.0001) && next?.event?.kind !== 'rest' && Math.abs((next?.event.beats ?? 0) - 0.5) < 0.0001
      if (!joinsEighths) flush()
    }
  }
  flush()
  return result
}
