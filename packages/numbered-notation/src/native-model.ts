import { SCORE_NUMBER_FONT, SCORE_TEXT_FONT } from './font-family.js'
import { lyricSpacing } from './lyric-spacing.js'
import type { NativeMeterGeometry } from './native-meter.js'
import { nativeArpeggioGeometry } from './native-arpeggio.js'
import { measureNativeNavigation, type NativeNavigation } from './native-navigation.js'
import { nativeCoreGap, nativeStyle } from './native-style.js'
import { nativeLyricInk } from './native-lyrics.js'
import { measureNativeControl, measureNativeTempo } from './native-controls.js'
import type { NativeTempoGeometry } from './native-tempo.js'
import { NativeMusicPainter } from './native-music.js'
import { unionNativeInk, type NativeInk } from './native-ink.js'
import { incomingMeasureKeys, resolveScorePitches, sectionEntryKey, sectionKeyVisits, sectionVisitKey, parseM3NGrace, parseM3NGroupPitches, scoreEventIds, type ScoreDocument, type ScoreEvent, type ScoreMeasure } from '@m3n/notation'
import { lyricsByEvent, type LyricsByEvent, type LyricRowData } from './lyrics.js'
import { sustainContinuations } from './sustains.js'
import type { TextMeasurer } from './native-measure.js'
import { nativeGraceGeometry, type NativeGracePitch } from './native-grace.js'
import { nativeNoteMetrics } from './native-note-metrics.js'
import { nativeAccidentalAdvance } from './native-accidentals.js'
import { nativeGlyphMarkStack, nativeInnerMark, type NativeMarkPlacement } from './native-marks.js'
import type { NativeKeyRow } from './native-key.js'
import { fixedDoPitch, fixedDoGrace, transposedNumberedKeyLabel } from './fixed-do.js'

export type NativeDiagnostic = { code: string; message: string; severity: 'warning' | 'error'; sourceStart?: number; sourceEnd?: number }
export type NativePitch = { degree: string; accidental: string; octave: number }
export type NativeControl = { kind: 'key' | 'meter' | 'tempo' | 'section' | 'segno' | 'coda'; text: string; keyRows?: NativeKeyRow[]; meterGeometry?: NativeMeterGeometry; tempoGeometry?: NativeTempoGeometry; width: number; anchor: number; top: number; bottom: number; ink: NativeInk[]; x?: number; textInset?: number }
export type NativeAnnotation = { text: string; kind: 'chord' | 'text' | 'expression' | 'section'; x: number; textX: number; top: number; width: number; height: number; baseline: number }
export type NativeGlyph = {
  event?: ScoreEvent; id: string; xmlId: string; measureId: string; staff: 'melody' | 'bass'; lane: string; slot: number
  time: number; beats: number; writtenBeats: number; sustain: boolean; pitches: NativePitch[]; pitchOffsets?: number[]; graces: NativeGracePitch[]
  lyrics: Map<number, LyricRowData>; lyricBaselines?: Map<number, number>; passes?: number[]; controls: NativeControl[]; marks: string[]; annotations: string[]; tempoAnnotation?: string
  arpeggioLayout?: ReturnType<typeof nativeArpeggioGeometry>; markLayout?: NativeMarkPlacement[]; annotationLayout?: NativeAnnotation[]; inkLeft?: number; inkRight?: number; musicBottom?: number; graceLayout?: ReturnType<typeof nativeGraceGeometry>; musicLeft?: number; musicRight?: number; musicTop?: number; lyricLeft?: number; lyricRight?: number; lyricHyphenEnds?: Map<number, number>; lyricTiers?: ({ left: number; right: number } | undefined)[]
  tieTop?: number; musicInk?: NativeInk[]
  left: number; right: number; top: number; bottom: number; x: number; y: number; multiRest?: number; interlude?: boolean; paragraph: string
  instrumental?: boolean; parenthesisLeft?: number; parenthesisRight?: number; parenthesisGap?: number
}
export type NativeColumn = {
  time: number; glyphs: NativeGlyph[]; left: number; right: number; x: number
  minimumStart?: number; minimumEnd?: number
}
export type NativeMeasure = {
  id: string; source: ScoreMeasure; part: number; index: number; columns: NativeColumn[]; beats: number
  breakBefore: boolean; breakAfter: boolean; extraGap: number; minimum: number; label?: string
  start: number; end: number; continuation: boolean; lastFragment: boolean; number?: number
  minimumStart?: number; minimumEnd?: number; barX?: number; openingBarX?: number
  navigation?: NativeNavigation[]
}
export type NativeProjection = { measures: NativeMeasure[]; glyphs: NativeGlyph[]; diagnostics: NativeDiagnostic[]; hasBass: boolean }
export type NativeModelOptions = { includeBass?: boolean; textMeasurer: TextMeasurer; fixedDo?: boolean; transpose?: number; tempoScale?: number; displayLyrics?: LyricsByEvent; expandedDisplay?: boolean; minimumNoteGap?: number }

export function numberedPitch(token: string, shift = 0): NativePitch {
  const match = /^([0-7])([#b=]*)([ed]*)/.exec(token)
  return { degree: match?.[1] ?? '0', accidental: (match?.[2] ?? '').replaceAll('#', '♯').replaceAll('b', '♭').replaceAll('=', '♮'), octave: match?.[1] === '0' ? 0 : [...(match?.[3] ?? '')].reduce((value, char) => value + (char === 'e' ? 1 : -1), shift) }
}

/** Display-only numbered pitch spelling, already resolved to an absolute or header pitch. */
export function nativeDisplayPitch(spelling: string): NativePitch {
  const match = /^([#bn]*)([0-7])([',]*)$/.exec(spelling)
  if (!match) throw new Error(`无法显示简谱音高 ${spelling}`)
  return {degree:match[2]!,accidental:match[1]!.replaceAll('n','').replaceAll('#','♯').replaceAll('b','♭'),octave:[...match[3]!].reduce((n,char)=>n+(char === "'" ? 1 : -1),0)}
}

/** Typed projection: no generated notation language and no second parser. */
export function projectNativeScore(document: ScoreDocument, options: NativeModelOptions): NativeProjection {
  const painter = new NativeMusicPainter(options.textMeasurer)
  const ids = scoreEventIds(document), lyrics = options.displayLyrics ?? lyricsByEvent(document), sustains = sustainContinuations(document, lyrics)
  const result: NativeProjection = { measures: [], glyphs: [], diagnostics: [], hasBass: options.includeBass !== false && [...document.parts.values()].some(part => part.bass.some(measure => measure.events.length || measure.multiRest)) }
  const textWidth = (text: string, size = nativeStyle.annotation, family = SCORE_TEXT_FONT) => options.textMeasurer.measureText(text, { fontSize: size, fontFamily: family }).w
  const known = new Set(['tr', 'prall', 'fermata', 'arp', 'str', 'tip', 'hold', 'brk', 'breath', 'sfz', 'f1', 'f2', 'f3', 'f4', 'f5'])
  const sectionKeys = new Map((document.order ?? []).map(name => [name, {entry:sectionEntryKey(document,name),visits:sectionKeyVisits(document,name)}]))
  // Compact sections show their first visit's key, with numbered alternatives
  // at entries and modulations. Compare incoming edges in that same display key
  // so later transposed visits do not manufacture a change at every bar.
  const displayDocument = document.orderKeys
    ? { ...document, orderKeys: document.order!.map(name => sectionKeys.get(name)!.visits[0]) }
    : document
  let partIndex = 0, measureNumber = 0
  for (const part of document.parts.values()) {
    const incomingKeys = incomingMeasureKeys(displayDocument, part.melody)
    const resolved = options.fixedDo ? new Map([
      ...resolveScorePitches(part.melody), ...resolveScorePitches(part.bass),
    ]) : undefined
    const keyLabel = (key:string) => transposedNumberedKeyLabel(key,options.transpose)
    const states = new Map<string, { key: string; tempo: number; meter: string; dynamic: string; passKeys?: readonly string[] }>()
    const projectMeasure = (measure: ScoreMeasure, staff: 'melody' | 'bass', lane: string, host: NativeMeasure) => {
      let time = 0
      const state = states.get(lane) ?? { key: document.key, tempo: document.tempo, meter: `${document.meterCount}/${document.meterUnit}`, dynamic: '' }
      states.set(lane, state)
      const predecessors = incomingKeys.get(host.source)
      const passKeys = measure.events[0]?.keyPasses ?? measure.multiRestState?.keyPasses
      if (passKeys && state.passKeys === passKeys) state.key = passKeys[0]!
      else if (predecessors?.size) state.key = predecessors.size === 1 ? [...predecessors][0]! : ''
      const accidentals = new Map<string, string>()
      const settingsControls = (settings: Pick<ScoreEvent, 'key' | 'keyPasses' | 'meterCount' | 'meterUnit' | 'tempo'>) => {
        const controls: NativeControl[] = []
        const control = (kind: NativeControl['kind'], text: string) => controls.push(measureNativeControl(kind, text, options.textMeasurer))
        if (!options.fixedDo && settings.keyPasses && settings.keyPasses !== state.passKeys) {
          const groups = new Map<string,number[]>()
          settings.keyPasses.forEach((key,index) => groups.set(key,[...(groups.get(key) ?? []),index+1]))
          const rows = [...groups].map(([key,passes]) => ({key:keyLabel(key),label:passes.join(',')}))
          controls.push(measureNativeControl('key',keyLabel(settings.key),options.textMeasurer,rows))
          state.key = settings.key; accidentals.clear()
        }
        state.passKeys = settings.keyPasses
        if (!options.fixedDo && settings.key !== state.key) { control('key', keyLabel(settings.key)); state.key = settings.key; accidentals.clear() }
        const meter = `${settings.meterCount ?? document.meterCount}/${settings.meterUnit ?? document.meterUnit}`
        if (meter !== state.meter) { control('meter', meter); state.meter = meter }
        if (settings.tempo !== undefined && settings.tempo !== state.tempo) {
          const unit = settings.meterUnit ?? document.meterUnit
          controls.push(measureNativeTempo({ unit, bpm: settings.tempo * unit / 4 * (options.tempoScale ?? 1) }, options.textMeasurer)); state.tempo = settings.tempo
        }
        return controls
      }

      for (const [eventIndex, event] of measure.events.entries()) {
        if (!Number.isFinite(event.beats) || event.beats <= 0) throw new Error('简谱音符时值必须为正数。')
        const controls: NativeControl[] = []
        const control = (kind: NativeControl['kind'], text: string) => {
          controls.push(measureNativeControl(kind, text, options.textMeasurer))
        }
        if (staff === 'melody' && event.sectionLabel && !event.sectionLabelBreakAfter) control('section', event.sectionLabel)
        if (eventIndex === 0 && (measure.navigation?.includes('segno') || measure.events.some(event => event.navigation.includes('segno')))) control('segno', '𝄋')
        if (eventIndex === 0 && (measure.navigation?.includes('coda') || measure.events.some(event => event.navigation.includes('coda')))) control('coda', 'Coda')
        const keys = sectionKeys.get(host.source.sectionName ?? '')
        const visits = keys?.visits ?? []
        const entry = keys?.entry ?? event.key
        const displayKey = visits[0] ? sectionVisitKey(event.key,entry,visits[0]) : event.key
        if (!options.fixedDo && new Set(visits).size > 1 && (event.sectionLabel || displayKey !== state.key)) {
          const groups = new Map<string,number[]>()
          visits.forEach((key,index) => {
            const current = sectionVisitKey(event.key,entry,key)
            groups.set(current,[...(groups.get(current) ?? []),index+1])
          })
          const rows = [...groups].map(([key,passes]) => ({key:keyLabel(key),label:passes.length > 1 && passes.at(-1)!-passes[0]! === passes.length-1 ? `${passes[0]}–${passes.at(-1)}` : passes.join(',')}))
          controls.push(measureNativeControl('key',keyLabel(displayKey),options.textMeasurer,rows))
          state.key = displayKey; accidentals.clear()
        }
        controls.push(...settingsControls({...event,key:displayKey}))
        const tempoIndex = event.expression ? controls.findIndex(control => control.kind === 'tempo') : -1
        const tempoAnnotation = tempoIndex >= 0 ? controls.splice(tempoIndex, 1)[0]!.text : undefined
        const graces = event.postfixes.flatMap(mark => { const grace = parseM3NGrace(mark); return grace ? (parseM3NGroupPitches(grace.pitchSource) ?? []).map(pitch => ({ ...(options.fixedDo ? nativeDisplayPitch(fixedDoGrace(pitch,event.key,event.octaveShift,options.transpose)) : numberedPitch(pitch,event.octaveShift)), writtenBeats: 1 / 2 ** (grace.depth + 1) })) : [] })
        for (const mark of event.postfixes) if (!known.has(mark) && !parseM3NGrace(mark)) result.diagnostics.push({ code: 'NUMBERED_UNSUPPORTED_MARK', message: `简谱尚不支持标记 ${mark}`, severity: 'warning', sourceStart: event.sourceStart, sourceEnd: event.sourceEnd })
        const marks = event.postfixes.filter(mark => known.has(mark) && mark !== 'arp')
        if (event.dynamic && event.dynamic !== state.dynamic) { marks.push(event.dynamic); state.dynamic = event.dynamic }
        if (event.prefix) marks.push(event.prefix)
        for (const interval of document.intervals.filter(interval => interval.staff === staff && interval.start === event.sourceStart)) {
          if ((interval.kind === 'cresc' || interval.kind === 'decres') && interval.display === 'text') marks.push(interval.kind === 'cresc' ? 'cresc.' : 'dim.')
          if (interval.kind === 'accel' || interval.kind === 'rit') marks.push(`${interval.kind}. → ${interval.tempoTarget}`)
        }
        const append = (tokens: string[], beats: number, writtenBeats: number, slot: number, segment: number, sustain: boolean) => {
          const pitches = tokens.map((token,index) => {
            if (options.fixedDo && !token.startsWith('0')) {
              const absolute = resolved!.get(event)![event.kind === 'tuplet' ? slot : index]!
              return nativeDisplayPitch(fixedDoPitch(absolute,options.transpose))
            }
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
          const glyphAnnotations = segment === 0 && slot === 0 ? [event.chord, event.text, event.expression, event.sectionLabelBreakAfter ? event.sectionLabel : undefined].filter((value): value is string => Boolean(value)) : []
          const pitchWidth = sustain ? 2 * (nativeStyle.music * .2) + (nativeStyle.music * .09) : textWidth('0', nativeStyle.music, SCORE_NUMBER_FONT)
          const accidentalWidth = sustain ? 0 : Math.max(0, ...pitches.map(pitch => nativeAccidentalAdvance(pitch.accidental, nativeStyle.music, options.textMeasurer)))
          const durationBase = 2 ** Math.floor(Math.log2(writtenBeats))
          const dotCount = Math.max(0, [1, 1.5, 1.75, 1.875].findIndex(ratio => Math.abs(writtenBeats / durationBase - ratio) < 1e-7))
          let left = pitchWidth / 2 + accidentalWidth, right = pitchWidth / 2 + dotCount * nativeStyle.music * 0.27
          const graceLayout = glyphGraces.length ? nativeGraceGeometry(glyphGraces, left, options.textMeasurer) : undefined
          if (graceLayout) left = graceLayout.left
          let musicLeft = left, musicRight = right
          let lyricLeft = 0, lyricRight = 0
          const lyricTiers = [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => {
            if (!row.annotation && !row.texts.some(text => text.replaceAll('\u200B', '').trim())) return undefined
            const ink = nativeLyricInk(row, options.textMeasurer)
            lyricLeft = Math.max(lyricLeft, -ink.left + lyricSpacing.horizontalPadding)
            lyricRight = Math.max(lyricRight, ink.right + lyricSpacing.horizontalPadding)
            left = Math.max(left, -ink.left)
            right = Math.max(right, ink.right)
            return { left: -ink.left + lyricSpacing.horizontalPadding, right: ink.right + lyricSpacing.horizontalPadding }
          })
          const metrics = nativeNoteMetrics(pitches, writtenBeats, sustain, options.textMeasurer)
          const musicTop = metrics.top
          const top = Math.max(musicTop, ...glyphControls.map(control => control.top))
          const bottom = Math.max(metrics.bottom, ...glyphControls.map(control => control.bottom))
          const id = ids.get(event)!
          const suffix = event.kind === 'tuplet' ? `-n${slot + 1}` : segment ? event.kind === 'rest' ? `-rest${segment + 1}` : `-sustain${segment + 1}` : ''
          const glyph: NativeGlyph = { event, id: id + suffix, xmlId: options.expandedDisplay ? id.replace(/-rend\d+$/, '') : id, measureId: host.id, staff, lane, slot, time, beats, writtenBeats, sustain, pitches, pitchOffsets: metrics.offsets, graces: glyphGraces, lyrics: rows, passes: options.expandedDisplay ? [Number(/-rend(\d+)$/.exec(id)?.[1] ?? 1)] : undefined, controls: glyphControls, marks: glyphMarks, annotations: glyphAnnotations, tempoAnnotation: segment === 0 && slot === 0 ? tempoAnnotation : undefined, graceLayout, musicLeft, musicRight, musicTop, lyricLeft, lyricRight, lyricTiers, left, right, top, bottom, x: 0, y: 0, paragraph: `${partIndex}:${document.paragraphs?.find(paragraph => paragraph.start <= event.sourceStart && event.sourceStart < paragraph.end)?.id ?? '0'}` }
          if (event.postfixes.includes('arp') && event.kind === 'chord' && !sustain) {
            const body = unionNativeInk(painter.bodyPieces(glyph))
            glyph.arpeggioLayout = nativeArpeggioGeometry(body, options.textMeasurer)
            const hostLeft = Math.max(pitchWidth / 2 + accidentalWidth, -body.left, -glyph.arpeggioLayout.ink.left)
            glyph.graceLayout = glyphGraces.length ? nativeGraceGeometry(glyphGraces, hostLeft, options.textMeasurer) : undefined
            glyph.musicLeft = Math.max(hostLeft, glyph.graceLayout?.left ?? 0)
            glyph.musicRight = Math.max(musicRight, body.right, glyph.arpeggioLayout.ink.right)
            glyph.left = Math.max(glyph.musicLeft, lyricLeft)
            glyph.right = Math.max(glyph.musicRight, lyricRight)
          }
          glyph.markLayout = nativeGlyphMarkStack(glyph, glyphMarks.filter(nativeInnerMark), painter.measurer, nativeCoreGap(document), metrics.top).items
          // Local marks remain centered on their host, so reserve their full
          // width before wrapping instead of shifting them outside relations.
          glyph.musicLeft = Math.max(glyph.musicLeft ?? 0, ...glyph.markLayout.map(mark => -mark.left))
          glyph.musicRight = Math.max(glyph.musicRight ?? 0, ...glyph.markLayout.map(mark => mark.right))
          glyph.left = Math.max(glyph.left, glyph.musicLeft)
          glyph.right = Math.max(glyph.right, glyph.musicRight)
          glyph.musicInk = painter.musicPieces(glyph)
          const ink = unionNativeInk(glyph.musicInk)
          // Without side components or marks, the connection body is exactly
          // the music body already measured above. Decorated notes keep their
          // separate connection geometry, which excludes accidentals/graces.
          const sameTieBody = !glyph.graces.length && !glyph.markLayout.length && !event.postfixes.includes('arp')
            && glyph.pitches.every(pitch => !pitch.accidental)
          glyph.tieTop = -(sameTieBody ? ink : painter.tieBodyInk(glyph)).top
          glyph.musicTop = -ink.top; glyph.top = Math.max(-ink.top, ...glyphControls.map(control => control.top))
          glyph.musicBottom = ink.bottom; glyph.bottom = Math.max(ink.bottom, ...glyphControls.map(control => control.bottom))
          glyph.inkLeft = -ink.left; glyph.inkRight = ink.right
          glyph.instrumental = document.intervals.some(interval => interval.kind === 'inst' && interval.staff === staff && interval.start !== undefined && interval.end !== undefined && interval.start <= event.sourceStart && event.sourceEnd <= interval.end)
          if (glyph.instrumental) {
            const style = { fontSize: nativeStyle.music, fontFamily: SCORE_NUMBER_FONT }
            const left = options.textMeasurer.measureText('(', style), right = options.textMeasurer.measureText(')', style)
            // Each side contributes the same half-gap as a quarter note.
            glyph.parenthesisGap = (options.minimumNoteGap ?? nativeStyle.minimumNoteGap)
            glyph.parenthesisLeft = left.w - Math.min(0, left.inkLeft ?? 0) + glyph.parenthesisGap
            glyph.parenthesisRight = Math.max(right.w, right.inkRight ?? right.w) + glyph.parenthesisGap
          }
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
      if (measure.multiRest || measure.interlude) {
        const controls = measure.multiRestState ? settingsControls(measure.multiRestState) : []
        if (measure.navigation?.includes('coda')) controls.unshift(measureNativeControl('coda','Coda',options.textMeasurer))
        const [count, unit] = state.meter.split('/').map(Number)
        const position = measure.barEnd === undefined ? undefined : measure.barEnd - 1
        const paragraph = position === undefined ? '0' : document.paragraphs?.find(range => range.start <= position && position < range.end)?.id ?? '0'
        const glyph: NativeGlyph = { id: `m3n-rest-${partIndex + 1}-${host.index + 1}-${lane}`, xmlId: `m3n-rest-${partIndex + 1}-${host.index + 1}`, measureId: host.id, staff, lane, slot: 0, time: 0, beats: measure.interlude ? 0 : measure.multiRest! * count! * 4 / unit!, writtenBeats: 1, sustain: false, pitches: [numberedPitch('0')], graces: [], lyrics: new Map(), controls, marks: [], annotations: [], left: 0, right: 0, top: 0, bottom: 0, x: 0, y: 0, multiRest: measure.multiRest ?? 1, interlude: measure.interlude, paragraph: `${partIndex}:${paragraph}` }
        if (measure.navigation?.includes('segno')) glyph.controls.unshift(measureNativeControl('segno', '𝄋', options.textMeasurer))
        glyph.markLayout = []
        const ink = unionNativeInk(painter.musicPieces(glyph))
        glyph.musicTop = -ink.top
        glyph.top = Math.max(-ink.top, ...glyph.controls.map(control => control.top))
        glyph.bottom = Math.max(ink.bottom, ...glyph.controls.map(control => control.bottom))
        glyph.inkLeft = -ink.left; glyph.inkRight = ink.right
        glyph.left = glyph.musicLeft = nativeStyle.music * 0.4
        glyph.right = glyph.musicRight = ink.right + nativeStyle.music * 0.25
        glyph.musicBottom = ink.bottom
        result.glyphs.push(glyph); time = glyph.beats
      }
      return time
    }
    const count = Math.max(part.melody.length, result.hasBass ? part.bass.length : 0)
    for (let index = 0; index < count; index++) {
      const source = part.melody[index] ?? { events: [] }
      if (!source.events.length && !source.multiRest && !source.interlude && !part.bass[index]?.events.length) continue
      const measure: NativeMeasure = { id: `m3n-measure-${partIndex + 1}-${index + 1}`, source, part: partIndex, index, columns: [], beats: 0, breakBefore: index === 0 || Boolean(source.breakBefore || part.melody[index - 1]?.breakAfter || source.events.some(event => event.sectionLabel)), breakAfter: Boolean(source.breakAfter), extraGap: result.measures.at(-1)?.part === partIndex && source.events.some(event => event.sectionLabel && !event.sectionLabelBreakAfter) ? (nativeCoreGap(document) * .4) : 0, minimum: 0, start: 0, end: 0, continuation: false, lastFragment: true }
      measure.number = source.interlude ? measureNumber : ++measureNumber
      measureNumber += (source.multiRest ?? 1) - 1
      measure.navigation = [...new Set([...(source.navigation ?? []), ...source.events.flatMap(event => event.navigation)])]
        .filter(name => name !== 'segno' && name !== 'coda').map(name => measureNativeNavigation(name, options.textMeasurer))
      const first = result.glyphs.length
      measure.beats = projectMeasure(source, 'melody', 'melody', measure)
      if (result.hasBass && part.bass[index]) measure.beats = Math.max(measure.beats, projectMeasure(part.bass[index]!, 'bass', 'bass', measure))
      const byTime = new Map<number, NativeGlyph[]>()
      for (const glyph of result.glyphs.slice(first)) { const time = Math.round(glyph.time * 1e9) / 1e9; byTime.set(time, [...(byTime.get(time) ?? []), glyph]) }
      const times = [...byTime.keys()].sort((a, b) => a - b)
      measure.columns = times.map(time => {
        const glyphs = byTime.get(time)!
        return { time, glyphs, left: Math.max(...glyphs.map(glyph => glyph.left + glyph.controls.reduce((sum, control) => sum + control.width, 0))), right: Math.max(...glyphs.map(glyph => glyph.right)), x: 0 }
      })
      result.measures.push(measure)
    }
    partIndex++
  }
  return result
}

/** Copy only placement state. Musical inputs and measured local geometry remain
 * read-only; every spacing trial owns its glyphs, controls, marks and columns. */
export function cloneNativeProjection(source: NativeProjection): NativeProjection {
  const controls = new Map<NativeControl, NativeControl>()
  const glyphs = new Map(source.glyphs.map(glyph => [glyph, {
    ...glyph,
    controls: glyph.controls.map(control => {
      let copy = controls.get(control)
      if (!copy) { copy = {...control}; controls.set(control,copy) }
      return copy
    }),
    markLayout: glyph.markLayout?.map(mark=>({...mark})),
  }]))
  return {...source, diagnostics:[...source.diagnostics], glyphs:source.glyphs.map(glyph=>glyphs.get(glyph)!),
    measures:source.measures.map(measure=>({...measure, navigation:measure.navigation?.map(mark=>({...mark})),
      columns:measure.columns.map(column=>({...column,glyphs:column.glyphs.map(glyph=>glyphs.get(glyph)!)}))}))}
}
