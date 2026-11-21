import {
  deriveScoreInteraction, incomingMeasureKeys, m3nPitch, parseKey, parseM3NGrace,
  parseM3NGroupPitches, resolveScorePitches, sectionVisitKey, scoreEventIds, unfoldScorePerformance,
  playbackMeasureIndexes, orderedMeasureIndexes, hasPassKeys, sectionEntryKey, sectionKeyVisits,
  type ScoreDocument, type ScoreMeasure, type ScoreEvent, type ScoreEventLyric,
} from '@m3n/notation'
import type { NotationMode } from './renderer-settings'

const pitchNames = ['C', '升C', 'D', '降E', 'E', 'F', '升F', 'G', '降A', 'A', '降B', 'B']
const solfege = ['', '哆', '来', '咪', '发', '嗦', '拉', '西']
const modes: Record<string, string> = { '': '大调', m: '小调', dor: '多利亚调式', phr: '弗里几亚调式', lyd: '利底亚调式', mix: '混合利底亚调式', loc: '洛克里亚调式' }
const navigation: Record<string, string> = { segno: '返回标记', ds: '返回标记处重奏', dc: '从头重奏', fine: '返回后在此结束', tocoda: '返回后跳至尾声', coda: '尾声起点' }
const intervals: Record<string, string> = { lg: '连奏', cresc: '渐强', decres: '渐弱', accel: '渐快', rit: '渐慢', '8va': '高八度', '8vb': '低八度', inst: '器乐' }
const marks: Record<string, string> = { tr: '颤音', prall: '波音', fermata: '延长记号', arp: '琶音', str: '断奏', tip: '重音', hold: '保持音', brk: '换气', breath: '换气' }
const number = (value: number) => String(Number(value.toFixed(6)))
const spelling = (value: string) => value.replace(/#/g, '升').replace(/b/g, '降')
const lyricLabel = (lyrics: ScoreEventLyric[]) => {
  const passes = [...new Set(lyrics.flatMap(lyric => [...lyric.passes ?? []]))].sort((a, b) => a - b)
  return passes.length ? `第${passes.join('、')}遍歌词` : '歌词'
}

function absoluteNumber(absolute: string) {
  const [letter, octave, accidental = ''] = absolute.split(':')
  return Number(octave) * 12 + ({ c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[letter!] ?? 0)
    + ({ s: 1, ss: 2, x: 2, f: -1, ff: -2, n: 0 }[accidental] ?? 0)
}

function absoluteText(absolute: string, transpose: number) {
  const value = absoluteNumber(absolute) + transpose
  return `${pitchNames[((value % 12) + 12) % 12]}${Math.floor(value / 12)}，科学音高记法`
}

function keyText(key: string, transpose: number) {
  const shifted = transpose ? sectionVisitKey(key, 'C', ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][((transpose % 12) + 12) % 12]!) : key
  const { tonic, mode } = parseKey(shifted)
  const name = spelling(tonic).replace(/^([A-G])(升|降)$/, '$2$1')
  return `${name}${modes[mode] ?? mode}`
}

function duration(beats: number, unit: number) {
  const names: Record<string, string> = { '4': '全音符', '3': '附点二分音符', '2': '二分音符', '1.75': '双附点四分音符', '1.5': '附点四分音符', '1': '四分音符', '0.75': '附点八分音符', '0.5': '八分音符', '0.375': '附点十六分音符', '0.25': '十六分音符', '0.125': '三十二分音符', '0.0625': '六十四分音符' }
  return `${names[String(beats)] ?? '音符'}，${number(beats * unit / 4)}拍`
}

export type AccessibleMeasure = { id: string; label: string; voices: { name: string; events: string[]; eventIds: string[]; compact: string }[] }
export type AccessibleScore = { title: string; summary: string; measures: AccessibleMeasure[] }

/** Semantic reading text, independent of SVG, pagination and audio scheduling. */
export function describeAccessibleScore(source: ScoreDocument, options: { notationMode?: NotationMode; transpose?: number; tempoScale?: number; forDisplay?: boolean } = {}): AccessibleScore {
  const transpose = options.transpose ?? 0, tempoScale = options.tempoScale ?? 1
  let document = source
  let { lyricsByEvent } = deriveScoreInteraction(source)
  const keyed = Boolean(source.orderKeys?.some(Boolean))
  const octaves = Boolean(source.orderKeyOctaves?.some(octave => octave !== undefined && octave !== 4))
  const expanded = options.forDisplay
    ? options.notationMode === 'staff' ? hasPassKeys(source) || keyed || octaves : options.notationMode === 'fixed' && (hasPassKeys(source) || keyed)
    : keyed || octaves
  if (options.forDisplay && !expanded && keyed && options.notationMode !== 'fixed' && options.notationMode !== 'staff') {
    const displayLyrics = new Map<ScoreEvent, ScoreEventLyric[]>()
    const project = (measure: ScoreMeasure, section = measure.sectionName) => {
      const entry = section ? sectionEntryKey(source, section) : undefined
      const target = section ? sectionKeyVisits(source, section)[0] : undefined
      const key = (value: string) => entry && target ? sectionVisitKey(value, entry, target) : value
      return { ...measure, multiRestState: measure.multiRestState && { ...measure.multiRestState, key: key(measure.multiRestState.key) }, events: measure.events.map(event => {
        const displayed = { ...event, key: key(event.key) }
        displayLyrics.set(displayed, lyricsByEvent.get(event) ?? [])
        return displayed
      }) }
    }
    document = { ...source, parts: new Map([...source.parts].map(([name, part]) => [name, {
      melody: part.melody.map(measure => project(measure)),
      bass: part.bass.map((measure, index) => project(measure, part.melody[index]?.sectionName)),
    }])) }
    lyricsByEvent = displayLyrics
  }
  if (expanded) {
    const originals = new Map([...scoreEventIds(source)].map(([event, id]) => [id, event]))
    document = unfoldScorePerformance(source)
    const displayed = new Map<ScoreEvent, ScoreEventLyric[]>()
    for (const part of document.parts.values()) for (const measure of part.melody) for (const event of measure.events) {
      const id = event.playbackId!, pass = Number(/-rend(\d+)$/.exec(id)?.[1] ?? 1)
      const original = originals.get(id.replace(/-rend\d+$/, ''))!
      displayed.set(event, (lyricsByEvent.get(original) ?? []).filter(lyric => !lyric.passes || lyric.passes.has(pass)))
    }
    lyricsByEvent = displayed
  }
  const measureDescriptions: AccessibleMeasure[] = []
  const ids = scoreEventIds(document)
  let partIndex = 0
  let measureNumber = 0
  for (const [partName, part] of document.parts) {
    partIndex++
    const incoming = incomingMeasureKeys(document, part.melody)
    const resolved = new Map([...resolveScorePitches(part.melody), ...resolveScorePitches(part.bass)])
    const tiedTargets = new Set<ScoreEvent>()
    const sequence = document.order ? orderedMeasureIndexes(part.melody, document.order) : playbackMeasureIndexes(part.melody)
    for (const staff of [part.melody, part.bass]) {
      let tied = false
      for (const index of sequence) for (const event of staff[index]?.events ?? []) {
        if (tied) tiedTargets.add(event)
        tied = event.tie
      }
    }
    const compactKeys = new Map<string, string>()
    const voice = (measure: ScoreMeasure, name: string, pickupOffset: number) => {
      const events: string[] = []
      const compact: string[] = []
      let offset = pickupOffset
      for (const [index, event] of measure.events.entries()) {
        if (compactKeys.has(name) && compactKeys.get(name) !== event.key) compact.push(`（转调至${keyText(event.key, transpose)}）`)
        compactKeys.set(name, event.key)
        const digits = event.pitches.map((token, slot) => {
          if (token === '0') return '0'
          const absolute = resolved.get(event)?.[slot]
          if (options.notationMode === 'fixed' && absolute) {
            const pc = ((absoluteNumber(absolute) + transpose) % 12 + 12) % 12
            return ['1', '升1', '2', '降3', '3', '4', '升4', '5', '降6', '6', '降7', '7'][pc]!
          }
          const degree = /[1-7]/.exec(token)?.[0] ?? token
          const base = m3nPitch(token.replace(/[#b=]/g, ''), event.key)
          const difference = absolute ? absoluteNumber(absolute) - absoluteNumber(`${base.pname}:${base.oct + event.octaveShift}:${base.accidGes ?? base.accid}`) : 0
          return `${difference > 0 ? '升'.repeat(difference) : '降'.repeat(-difference)}${degree}`
        })
        compact.push(event.kind === 'rest' ? '0' : event.kind === 'chord' ? `（${digits.join('、')}）` : digits.join(' '))
        const unit = event.meterUnit ?? document.meterUnit
        const info: string[] = [`第${number(offset * unit / 4 + 1)}拍`]
        if (index === 0 || event.key !== measure.events[index - 1]!.key) info.push(`调性${keyText(event.key, transpose)}`)
        if (index === 0 || event.meterCount !== measure.events[index - 1]!.meterCount || event.meterUnit !== measure.events[index - 1]!.meterUnit) info.push(`${event.meterCount ?? document.meterCount}个${unit}分音符为一小节，以${unit}分音符为一拍`)
        if (index === 0 || event.tempo !== measure.events[index - 1]!.tempo) info.push(`每分钟${number((event.tempo ?? document.tempo) * unit / 4 * tempoScale)}拍`)
        const pitch = (token: string, slot: number) => {
          if (token === '0') return '休止'
          const absolute = resolved.get(event)?.[slot]
          const actual = absolute ? absoluteText(absolute, transpose) : token
          if (options.notationMode === 'staff') return actual
          if (options.notationMode === 'fixed' && absolute) {
            const value = absoluteNumber(absolute) + transpose, degree = [1, 1, 2, 3, 3, 4, 4, 5, 6, 6, 7, 7][((value % 12) + 12) % 12]!
            const alteration = ['', '升', '', '降', '', '', '升', '', '降', '', '降', ''][((value % 12) + 12) % 12]
            return `固定唱名${alteration}${solfege[degree]}，音高${actual}`
          }
          const degree = /[1-7]/.exec(token)?.[0]
          const accidental = token.includes('#') ? '升' : token.includes('b') ? '降' : token.includes('=') ? '还原' : ''
          return `${accidental}${solfege[Number(degree)] ?? token}，音级${degree ?? token}，音高${actual}`
        }
        const lyricRows = new Map<number, ScoreEventLyric[]>()
        for (const lyric of lyricsByEvent.get(event) ?? []) lyricRows.set(lyric.verseIndex, [...lyricRows.get(lyric.verseIndex) ?? [], lyric])
        if (event.kind === 'rest') info.push('休止', duration(event.beats, unit).replace('音符', '休止符'))
        else if (event.kind === 'tuplet') {
          let lyricSlot = 0
          info.push(`${event.tuplet?.num ?? event.pitches.length}连音，总时值${number(event.beats * unit / 4)}拍`, ...event.pitches.map((token, slot) => {
            const text = [`第${slot + 1}音：${pitch(token, slot)}，${number(event.beats / event.pitches.length * unit / 4)}拍`]
            if (token !== '0') {
              for (const lyrics of lyricRows.values()) if (lyrics[lyricSlot]?.kind === 'text') text.push(`${lyricLabel(lyrics)}“${lyrics[lyricSlot]!.text}”`)
              lyricSlot++
            }
            return text.join('，')
          }))
        }
        else info.push(event.kind === 'chord' ? `和音，同时奏出：${event.pitches.map(pitch).join('、')}` : pitch(event.pitches[0]!, 0), duration(event.beats, unit))
        if (tiedTargets.has(event)) info.push('延续前一个同音，不重新发音')
        if (event.tie) info.push('延音至后一个同音，不重新发音')
        if (event.kind !== 'tuplet') for (const lyrics of lyricRows.values()) {
          const texts = lyrics.filter(lyric => lyric.kind === 'text').map(lyric => lyric.text)
          if (texts.length) info.push(`${lyricLabel(lyrics)}“${texts.join('、')}”`)
        }
        if (event.chord) info.push(`和弦${event.chord}`)
        if (event.dynamic) info.push(`力度${event.dynamic}`)
        if (event.text) info.push(event.text)
        for (const mark of event.postfixes) {
          const grace = parseM3NGrace(mark)
          if (grace) info.push(`倚音：${(parseM3NGroupPitches(grace.pitchSource) ?? []).map(token => {
            const p = m3nPitch(token, event.key)
            return absoluteText(`${p.pname}:${p.oct + event.octaveShift}:${p.accidGes ?? p.accid}`, transpose)
          }).join('、')}`)
          else info.push(marks[mark] ?? mark)
        }
        for (const interval of document.intervals.filter(i => i.staff === (name === '低音' ? 'bass' : 'melody'))) {
          if (interval.start === event.sourceStart) info.push(`${intervals[interval.kind]}开始`)
          if (interval.endStart === event.sourceStart) info.push(`${intervals[interval.kind]}结束`)
        }
        info.push(...event.navigation.map(n => navigation[n]!))
        events.push(info.join('；') + '。')
        offset += event.beats
      }
      if (measure.multiRest) events.push(`连续休止${measure.multiRest}小节；调性${keyText(measure.multiRestState?.key ?? document.key, transpose)}。`)
      if (measure.multiRest) compact.push(`0（${measure.multiRest}小节）`)
      return { name, events, eventIds: measure.events.map(event => ids.get(event)!), compact: compact.join(' ') }
    }
    part.melody.forEach((measure, index) => {
      if (!measure.events.length && !measure.multiRest && !part.bass[index]?.events.length && !part.bass[index]?.multiRest) return
      measureNumber++
      const label = [`第${measureNumber}小节`]
      if (document.parts.size > 1) label.push(`声部${partName}`)
      if (measure.sectionName) label.push(`乐段${measure.sectionName}`)
      if (measure.ending) label.push(`第${measure.ending.replaceAll(',', '、')}遍房子`)
      if (measure.left === 'rptstart') label.push('反复开始')
      if (measure.right === 'rptend') label.push(`反复结束，共演奏${measure.repeatCount ?? 2}遍`)
      if (measure.right === 'end') label.push('全曲结束')
      const first = measure.events[0]
      const expected = (first?.meterCount ?? document.meterCount) * 4 / (first?.meterUnit ?? document.meterUnit)
      const actual = measure.events.reduce((sum, event) => sum + event.beats, 0)
      const short = actual > 0 && actual < expected - 1e-9
      const pickup = short && (index === 0 || measure.left === 'rptstart' || measure.sectionName !== part.melody[index - 1]?.sectionName)
      const pickupOffset = pickup ? expected - actual : 0
      if (short) label.push(`${pickup ? '弱起' : '不完全小节'}，共${number(actual * (first?.meterUnit ?? document.meterUnit) / 4)}拍`)
      label.push(...(measure.navigation ?? []).map(n => navigation[n]!))
      const entry = measure.events[0]?.key ?? measure.multiRestState?.key
      if (entry && [...incoming.get(measure) ?? []].some(key => key !== entry)) label.push(`转调至${keyText(entry, transpose)}`)
      const voices = [voice(measure, '旋律', pickupOffset)]
      if (part.bass[index]?.events.length || part.bass[index]?.multiRest) voices.push(voice(part.bass[index]!, '低音', pickupOffset))
      measureDescriptions.push({ id: `m3n-measure-${partIndex}-${index + 1}`, label: label.join('，'), voices })
      measureNumber += (measure.multiRest ?? 1) - 1
    })
  }
  const order = source.order?.map((name, index) => `${name}${source.orderKeys?.[index] ? `，${keyText(source.orderKeys[index]!, transpose)}` : ''}`).join('，然后')
  return {
    title: `${document.title || '乐谱'}，无障碍读谱`,
    summary: [`调性${keyText(document.key, transpose)}`, `${document.meterCount}个${document.meterUnit}分音符为一小节，以${document.meterUnit}分音符为一拍`, `每分钟${number(document.tempo * document.meterUnit / 4 * tempoScale)}拍`, expanded ? '换调再现按演奏顺序展开阅读' : '按书写小节顺序阅读，反复和房子另行说明', '音高使用科学音高记法，中央C为C4', order ? `演奏顺序：${order}` : ''].filter(Boolean).join('；') + '。',
    measures: measureDescriptions,
  }
}
