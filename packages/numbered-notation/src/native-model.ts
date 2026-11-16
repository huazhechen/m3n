import { displayedTempo, measurePlaybackPasses, parseM3NGrace, parseM3NGroupPitches, scoreEventIds, type ScoreDocument, type ScoreEvent, type ScoreMeasure } from '@m3n/notation'
import { lyricsByEvent, type LyricRowData } from './lyrics.js'
import { sustainContinuations } from './sustains.js'
import type { TextMeasurer } from './native-measure.js'

export type NativeDiagnostic = { code: string; message: string; severity: 'warning' | 'error'; sourceStart?: number; sourceEnd?: number }
export type NativePitch = { degree: string; accidental: string; octave: number }
export type NativeControl = { kind: 'key' | 'meter' | 'tempo' | 'section' | 'segno'; text: string; width: number }
export type NativeGlyph = {
  event?: ScoreEvent; id: string; xmlId: string; measureId: string; staff: 'melody' | 'bass'; lane: string; slot: number
  time: number; beats: number; writtenBeats: number; sustain: boolean; pitches: NativePitch[]; graces: NativePitch[]
  lyrics: Map<number, LyricRowData>; passes?: number[]; controls: NativeControl[]; marks: string[]; annotations: string[]
  left: number; right: number; top: number; bottom: number; x: number; y: number; multiRest?: number; paragraph: string
}
export type NativeColumn = { time: number; glyphs: NativeGlyph[]; left: number; right: number; gap: number; minimumGap: number; x: number }
export type NativeMeasure = {
  id: string; source: ScoreMeasure; part: number; index: number; columns: NativeColumn[]; beats: number
  breakBefore: boolean; breakAfter: boolean; extraGap: number; natural: number; minimum: number; label?: string
  start: number; end: number; continuation: boolean; lastFragment: boolean
}
export type NativeProjection = { measures: NativeMeasure[]; glyphs: NativeGlyph[]; diagnostics: NativeDiagnostic[]; hasBass: boolean }
export type NativeModelOptions = { includeBass?: boolean; noteGapEm?: number; minimumNoteGapEm?: number; textMeasurer: TextMeasurer }

export function numberedPitch(token: string, shift = 0): NativePitch {
  const match = /^([0-7])([#b=]*)([ed]*)/.exec(token)
  return { degree: match?.[1] ?? '0', accidental: (match?.[2] ?? '').replaceAll('#', '♯').replaceAll('b', '♭').replaceAll('=', '♮'), octave: match?.[1] === '0' ? 0 : [...(match?.[3] ?? '')].reduce((value, char) => value + (char === 'e' ? 1 : -1), shift) }
}

/** Typed projection: no generated notation language and no second parser. */
export function projectNativeScore(document: ScoreDocument, options: NativeModelOptions): NativeProjection {
  const ids = scoreEventIds(document), lyrics = lyricsByEvent(document), sustains = sustainContinuations(document, lyrics)
  const result: NativeProjection = { measures: [], glyphs: [], diagnostics: [], hasBass: options.includeBass !== false && [...document.parts.values()].some(part => part.bass.some(measure => measure.events.length || measure.multiRest)) }
  const textWidth = (text: string, size = 14, family = 'serif') => options.textMeasurer.measureText(text, { fontSize: size, fontFamily: family }).w
  const known = new Set(['tr', 'prall', 'fermata', 'arp', 'str', 'tip', 'hold', 'brk', 'breath', 'sfz', 'f1', 'f2', 'f3', 'f4', 'f5'])
  let partIndex = 0
  for (const part of document.parts.values()) {
    const passes = measurePlaybackPasses(part.melody)
    const states = new Map<string, { key: string; tempo: number; meter: string; dynamic: string }>()
    const projectMeasure = (measure: ScoreMeasure, staff: 'melody' | 'bass', lane: string, host: NativeMeasure, activePasses?: number[]) => {
      let time = 0
      const state = states.get(lane) ?? { key: document.key, tempo: document.tempo, meter: `${document.meterCount}/${document.meterUnit}`, dynamic: '' }
      states.set(lane, state)
      const accidentals = new Map<string, string>()
      for (const [eventIndex, event] of measure.events.entries()) {
        if (!Number.isFinite(event.beats) || event.beats <= 0) throw new Error('简谱音符时值必须为正数。')
        const controls: NativeControl[] = []
        const control = (kind: NativeControl['kind'], text: string) => controls.push({ kind, text, width: textWidth(text, kind === 'section' ? 14 : 16) + 14 })
        if (event.key !== state.key) { control('key', `1=${event.key}`); state.key = event.key; accidentals.clear() }
        const meter = `${event.meterCount ?? document.meterCount}/${event.meterUnit ?? document.meterUnit}`
        if (meter !== state.meter) { control('meter', meter); state.meter = meter }
        if (event.tempo !== undefined && event.tempo !== state.tempo) {
          const tempo = displayedTempo(event.tempo, event.meterCount ?? document.meterCount, event.meterUnit ?? document.meterUnit)
          control('tempo', `${tempo.unit === 8 ? '♪' : '♩'} = ${Number(tempo.bpm.toFixed(2))}`); state.tempo = event.tempo
        }
        if (staff === 'melody' && event.sectionLabel && !event.sectionLabelBreakAfter) control('section', event.sectionLabel)
        if (eventIndex === 0 && (measure.navigation?.includes('segno') || measure.events.some(event => event.navigation.includes('segno')))) control('segno', '𝄋')
        const graces = event.postfixes.flatMap(mark => { const grace = parseM3NGrace(mark); return grace ? (parseM3NGroupPitches(grace.pitchSource) ?? []).map(pitch => numberedPitch(pitch, event.octaveShift)) : [] })
        for (const mark of event.postfixes) if (!known.has(mark) && !parseM3NGrace(mark)) result.diagnostics.push({ code: 'NUMBERED_UNSUPPORTED_MARK', message: `简谱尚不支持标记 ${mark}`, severity: 'warning', sourceStart: event.sourceStart, sourceEnd: event.sourceEnd })
        const marks = event.postfixes.filter(mark => known.has(mark) && mark !== 'arp')
        if (event.dynamic && event.dynamic !== state.dynamic) { marks.push(event.dynamic); state.dynamic = event.dynamic }
        if (event.prefix) marks.push(event.prefix)
        for (const interval of document.intervals.filter(interval => interval.staff === staff && interval.start === event.sourceStart)) {
          if ((interval.kind === 'cresc' || interval.kind === 'decres') && interval.display === 'text') marks.push(interval.kind === 'cresc' ? 'cresc.' : 'dim.')
          if (interval.kind === 'accel' || interval.kind === 'rit') marks.push(`${interval.kind}. → ${interval.tempoTarget}`)
        }
        const append = (tokens: string[], beats: number, writtenBeats: number, slot: number, segment: number, sustain: boolean) => {
          const pitches = tokens.map(token => {
            const pitch = numberedPitch(token, event.octaveShift)
            const key = `${pitch.degree}:${pitch.octave}`
            if (pitch.accidental) {
              const previous = accidentals.get(key)
              accidentals.set(key, pitch.accidental)
              if (previous === pitch.accidental) return { ...pitch, accidental: '' }
            }
            return pitch
          })
          const rows = sustain ? new Map<number, LyricRowData>() : lyrics.get(event)?.get(slot) ?? new Map<number, LyricRowData>()
          const glyphControls = segment === 0 && slot === 0 ? controls : []
          const glyphMarks = segment === 0 && slot === 0 ? marks : []
          const glyphGraces = segment === 0 && slot === 0 ? graces : []
          const glyphAnnotations = segment === 0 && slot === 0 ? [event.chord, event.text, event.sectionLabelBreakAfter ? event.sectionLabel : undefined].filter((value): value is string => Boolean(value)) : []
          const pitchWidth = sustain ? 13 : Math.max(...pitches.map(pitch => textWidth(pitch.degree, 22, 'M3N Numbers') + (pitch.accidental ? textWidth(pitch.accidental, 14) + 3 : 0)), 12)
          let left = pitchWidth / 2 + glyphGraces.length * 14, right = pitchWidth / 2 + (writtenBeats % 1 ? 8 : 0)
          if (event.postfixes.includes('arp') && event.kind === 'chord') left += 8
          for (const row of rows.values()) {
            const width = textWidth(row.texts.join(''), 16)
            left = Math.max(left, width / 2 + (row.annotation ? textWidth(row.annotation, 12) + 5 : 0))
            right = Math.max(right, width / 2)
          }
          for (const annotation of glyphAnnotations) { const width = textWidth(annotation); left = Math.max(left, width / 2); right = Math.max(right, width / 2) }
          const upperOctaves = Math.max(0, ...pitches.map(pitch => pitch.octave)), lowerOctaves = Math.max(0, ...pitches.map(pitch => -pitch.octave))
          const chordHeight = sustain ? 0 : (pitches.length - 1) * 29
          const top = 22 + chordHeight + upperOctaves * 6 + glyphMarks.length * 15 + (glyphGraces.length ? 10 : 0)
          const bottom = 8 + lowerOctaves * 6 + Math.max(0, Math.ceil(-Math.log2(writtenBeats))) * 5
          const id = ids.get(event)!
          const suffix = event.kind === 'tuplet' ? `-n${slot + 1}` : segment ? event.kind === 'rest' ? `-rest${segment + 1}` : `-sustain${segment + 1}` : ''
          const glyph: NativeGlyph = { event, id: id + suffix, xmlId: id, measureId: host.id, staff, lane, slot, time, beats, writtenBeats, sustain, pitches, graces: glyphGraces, lyrics: rows, passes: activePasses, controls: glyphControls, marks: glyphMarks, annotations: glyphAnnotations, left, right, top, bottom, x: 0, y: 0, paragraph: `${partIndex}:${document.paragraphs?.find(paragraph => paragraph.start <= event.sourceStart && event.sourceStart < paragraph.end)?.id ?? '0'}` }
          result.glyphs.push(glyph); time += beats
        }
        if (event.kind === 'tuplet' && event.tuplet) event.pitches.forEach((pitch, slot) => append([pitch], event.beats / event.pitches.length, event.tuplet!.unitBeats, slot, 0, false))
        else {
          let remaining = event.beats, segment = 0
          while (remaining > 1e-7) {
            let beats = Math.min(1, remaining)
            const fraction = remaining % 1
            if (segment === 0 && remaining >= 1 && event.kind !== 'rest' && [0.5, 0.75, 0.875].some(value => Math.abs(value - fraction) < 1e-7)) beats = 1 + fraction
            append(event.pitches.length ? event.pitches : ['0'], beats, beats, 0, segment, event.kind !== 'rest' && (segment > 0 || sustains.has(event)))
            remaining -= beats; segment++
          }
        }
      }
      if (measure.multiRest) {
        const glyph: NativeGlyph = { id: `m3n-rest-${partIndex + 1}-${host.index + 1}-${lane}`, xmlId: `m3n-rest-${partIndex + 1}-${host.index + 1}`, measureId: host.id, staff, lane, slot: 0, time: 0, beats: measure.multiRest * document.meterCount * 4 / document.meterUnit, writtenBeats: 1, sustain: false, pitches: [numberedPitch('0')], graces: [], lyrics: new Map(), controls: [], marks: [], annotations: [], left: 18, right: 18, top: 38, bottom: 8, x: 0, y: 0, multiRest: measure.multiRest, paragraph: `${partIndex}:0` }
        result.glyphs.push(glyph); time = glyph.beats
      }
      return time
    }
    const count = Math.max(part.melody.length, result.hasBass ? part.bass.length : 0)
    for (let index = 0; index < count; index++) {
      const source = part.melody[index] ?? { events: [] }
      if (!source.events.length && !source.multiRest && !part.bass[index]?.events.length) continue
      const measure: NativeMeasure = { id: `m3n-measure-${partIndex + 1}-${index + 1}`, source, part: partIndex, index, columns: [], beats: 0, breakBefore: index === 0 || Boolean(source.breakBefore || part.melody[index - 1]?.breakAfter || source.events.some(event => event.sectionLabel)), breakAfter: Boolean(source.breakAfter), extraGap: source.events.some(event => event.sectionLabel) ? 12 : 0, natural: 0, minimum: 0, start: 0, end: 0, continuation: false, lastFragment: true }
      const first = result.glyphs.length
      const alternatives = document.alternatives?.filter(alternative => alternative.host === source) ?? []
      const primaryPasses = alternatives.length ? [...(passes.get(source) ?? [1])].filter(pass => !alternatives.some(alternative => alternative.passes.includes(pass))) : undefined
      measure.beats = projectMeasure(source, 'melody', 'melody', measure, primaryPasses)
      if (result.hasBass && part.bass[index]) measure.beats = Math.max(measure.beats, projectMeasure(part.bass[index]!, 'bass', 'bass', measure))
      for (const alternative of alternatives) projectMeasure(alternative.measure, 'melody', `alternative:${alternative.passes.join(',')}`, measure, alternative.passes)
      const byTime = new Map<number, NativeGlyph[]>()
      for (const glyph of result.glyphs.slice(first)) { const time = Math.round(glyph.time * 1e9) / 1e9; byTime.set(time, [...(byTime.get(time) ?? []), glyph]) }
      const times = [...byTime.keys()].sort((a, b) => a - b)
      measure.columns = times.map((time, index) => {
        const glyphs = byTime.get(time)!, duration = (times[index + 1] ?? measure.beats) - time
        const factor = Math.sqrt(Math.max(1 / 64, duration))
        return { time, glyphs, left: Math.max(...glyphs.map(glyph => glyph.left + glyph.controls.reduce((sum, control) => sum + control.width, 0))), right: Math.max(...glyphs.map(glyph => glyph.right)), gap: 22 * (options.noteGapEm ?? 0.6) * factor, minimumGap: 22 * (options.minimumNoteGapEm ?? 0.4) * factor, x: 0 }
      })
      measure.natural = measure.columns.reduce((sum, column) => sum + column.left + column.right + column.gap, 0) + 24
      measure.minimum = measure.columns.reduce((sum, column) => sum + column.left + column.right + column.minimumGap, 0) + 24
      result.measures.push(measure)
    }
    partIndex++
  }
  return result
}
