import type { ScoreDocument, ScoreEvent, ScoreMeasure } from '@m3n/notation'
import { jianpuKeyNumber, m3nPitchToMidi } from '@m3n/notation'
import { a4SourcePageHeight } from './score-export.js'
import { addScoreHeaderToSvg } from './score-header-svg.js'
import { layoutMeasures, positionEvents, type LayoutMeasure } from './m3n-jianpu-layout.js'
import { renderDurationLines } from './m3n-jianpu-duration-lines.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const PADDING = 34
const NOTE_SIZE = 28
const SYSTEM_GAP = 28
const SYSTEM_TOP = 86
const NAVIGATION_LABELS: Record<string, string> = { segno: '𝄋', ds: 'D.S.', dc: 'D.C.', fine: 'Fine' }

export type JianpuScoreOptions = {
  width: number
  paged: boolean
  compact?: boolean
  headerMetadata: ReadonlyArray<{ side: 'left' | 'center' | 'right'; value: string; priority: number }>
  fontFamily?: string
}

type PositionedEvent = {
  event: ScoreEvent
  start: number
  x: number
  width: number
  id: string
}

type RenderRow = {
  voiceId: string
  partIndex: number
  staff: 'melody' | 'bass'
  placement: LayoutMeasure
  layout: { events: PositionedEvent[]; width: number }
  y: number
  height: number
}

type EventBox = { event: ScoreEvent; x: number; y: number; page: SVGSVGElement }

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number | undefined> = {}) {
  const element = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attrs)) if (value !== undefined) element.setAttribute(name, String(value))
  return element
}

function text(value: string, attrs: Record<string, string | number | undefined> = {}) {
  const element = svg('text', attrs)
  element.textContent = value
  return element
}

function addJianpuStyle(page: SVGSVGElement, fontFamily: string) {
  const style = svg('style')
  style.textContent = `
    .jianpu-page{background:#fff}.m3n-jianpu-ink{fill:#111;stroke:#111}
    .jianpu-event{cursor:pointer}.event-bg{fill:transparent;stroke:transparent}
    .event-symbol{font:600 ${NOTE_SIZE}px 'Times New Roman','Noto Serif',serif;fill:#111;text-anchor:middle}
    .event-accidental{font:600 18px 'Times New Roman','Noto Serif',serif;fill:#111;text-anchor:end}
    .event-lyric{font:16px ${fontFamily};fill:#20242b;text-anchor:middle;letter-spacing:0}
    .event-dynamic,.m3n-jianpu-interval{font:italic 16px ${fontFamily};fill:#20242b;letter-spacing:0}
    .m3n-jianpu-signature,.m3n-jianpu-inline-setting,.m3n-jianpu-navigation,.m3n-jianpu-ending{font:16px ${fontFamily};fill:#30363e;letter-spacing:0}
    .relation-arc,.duration-line,.barline-thin,.barline-thick,.ending-bracket{fill:none;stroke:#111}
    .relation-arc{stroke-linecap:round}.tie-arc{stroke-width:1.45}.tuplet-arc{stroke-width:1.25}
    .barline-thin{stroke-width:1.25}.barline-thick{stroke-width:3.1}.repeat-dot,.octave-dot,.duration-dot{fill:#111}
    .is-source-active .event-bg{fill:#dcecff;stroke:#3b82c4;stroke-width:1}.is-highlighted .event-bg{fill:#f5d88b}
  `
  page.prepend(style)
}

function eventDuration(event: ScoreEvent) {
  return Math.max(0.125, event.beats)
}

function stableEventIds(document: ScoreDocument) {
  const ids = new Map<ScoreEvent, string>()
  let index = 0
  for (const part of document.parts.values()) {
    const measures = Math.max(part.melody.length, part.bass.length)
    for (let measureIndex = 0; measureIndex < measures; measureIndex += 1) {
      for (const event of part.melody[measureIndex]?.events ?? []) ids.set(event, `m3n-e-${++index}`)
      for (const event of part.bass[measureIndex]?.events ?? []) ids.set(event, `m3n-e-${++index}`)
    }
  }
  return ids
}

function measureLayout(measure: ScoreMeasure, measureIndex: number, compact: boolean, ids: ReadonlyMap<ScoreEvent, string>) {
  const events: PositionedEvent[] = []
  let start = 0
  let width = 0
  for (const [eventIndex, event] of measure.events.entries()) {
    const eventWidth = Math.max(compact ? 28 : 34, eventDuration(event) * (compact ? 34 : 42))
    events.push({ event, start, x: width, width: eventWidth, id: ids.get(event) ?? `m3n-event-${measureIndex + 1}-${eventIndex + 1}` })
    start += eventDuration(event)
    width += eventWidth
  }
  return { events, width: Math.max(52, width + 16) }
}

function alignMeasureLayout(layout: ReturnType<typeof measureLayout>, placement: LayoutMeasure, beat: number) {
  const positioned = positionEvents(placement, beat)
  return {
    ...layout,
    width: placement.width,
    events: layout.events.map((item, index) => {
      const slot = positioned[index]
      if (!slot) return item
      const width = Math.max(item.width, placement.cellWidth * Math.max(1, slot.layoutSpan))
      return { ...item, x: slot.centerX - width / 2, width }
    }),
  }
}

function lyricIndex(document: ScoreDocument) {
  const index = new Map<ScoreEvent, string[]>()
  const melodyEvents = [...document.parts.values()].flatMap((part) => part.melody.flatMap((measure) => measure.events))
  for (const block of document.lyrics) {
    if (block.targetStart === undefined || block.targetEnd === undefined) continue
    const targetStart = block.targetStart
    const targetEnd = block.targetEnd
    const targets = melodyEvents.filter((event) => (
      (event.kind === 'note' || event.kind === 'chord' || event.kind === 'tuplet')
      && event.sourceStart >= targetStart && event.sourceEnd <= targetEnd
    ))
    let targetIndex = 0
    for (const syllable of block.syllables) {
      if (syllable.kind !== 'text' || !syllable.text) continue
      while (targets[targetIndex]?.tie && !syllable.forceTiedTarget) targetIndex += 1
      const target = targets[targetIndex++]
      if (!target) break
      index.set(target, [...(index.get(target) ?? []), syllable.text])
    }
  }
  return index
}

function inlineSettingIndex(document: ScoreDocument) {
  const index = new Map<ScoreEvent, string>()
  for (const part of document.parts.values()) {
    for (const measures of [part.melody, part.bass]) {
      let key = document.key
      let meterCount = document.meterCount
      let meterUnit = document.meterUnit
      let tempo = document.tempo
      for (const measure of measures) for (const event of measure.events) {
        const labels: string[] = []
        if (event.key !== key) { labels.push(`1=${event.key}`); key = event.key }
        if (event.meterCount !== undefined && event.meterUnit !== undefined && (event.meterCount !== meterCount || event.meterUnit !== meterUnit)) {
          labels.push(`${event.meterCount}/${event.meterUnit}`)
          meterCount = event.meterCount
          meterUnit = event.meterUnit
        }
        if (event.tempo !== undefined && event.tempo !== tempo) { labels.push(`♩=${event.tempo}`); tempo = event.tempo }
        if (labels.length > 0) index.set(event, labels.join(' '))
      }
    }
  }
  return index
}

function graceText(postfixes: readonly string[]) {
  const grace = postfixes.find((postfix) => /^(ac|ap)\[/.test(postfix))
  return grace ? /\[([^\]]+)\]/.exec(grace)?.[1]?.replaceAll(/[()]/g, '') : undefined
}

function pitchGlyph(token: string, key: string, octaveShift = 0) {
  const raw = /^([1-7])([#b=]*)([ed]*)$/.exec(token)
  if (raw) {
    const octave = [...(raw[3] ?? '')].reduce((value, mark) => value + (mark === 'e' ? 1 : -1), octaveShift)
    return { degree: raw[1] ?? '1', accidental: raw[2] ?? '', octave }
  }
  const midi = m3nPitchToMidi(token, key, octaveShift)
  const tonic = jianpuKeyNumber(key)
  const relative = midi - (60 + tonic)
  const octave = Math.floor(relative / 12)
  const pitchClass = ((relative % 12) + 12) % 12
  const scale = [0, 2, 4, 5, 7, 9, 11]
  let degree = 0
  let distance = Number.POSITIVE_INFINITY
  for (const [index, value] of scale.entries()) {
    const candidate = Math.abs(value - pitchClass)
    if (candidate < distance) { degree = index; distance = candidate }
  }
  const base = scale[degree] ?? 0
  return { degree: String(degree + 1), accidental: pitchClass === base ? '' : pitchClass > base ? '#' : 'b', octave }
}

function accidentalGlyph(accidental: string) {
  if (accidental === '##') return '𝄪'
  if (accidental === 'bb') return '𝄫'
  if (accidental === '#') return '♯'
  if (accidental === 'b') return '♭'
  return accidental === '=' ? '♮' : ''
}

function appendPitch(group: SVGGElement, token: string, x: number, y: number, key: string, fontFamily: string, octaveShift = 0, scale = 1) {
  const glyph = pitchGlyph(token, key, octaveShift)
  const fontSize = NOTE_SIZE * scale
  const accidental = accidentalGlyph(glyph.accidental)
  if (accidental) group.append(text(accidental, { x: x - fontSize * 0.42, y: y - fontSize * 0.07, class: 'event-accidental', 'font-size': Math.max(12, fontSize * 0.61), 'font-family': fontFamily }))
  group.append(text(glyph.degree, { x, y, class: 'event-symbol', 'font-size': fontSize, 'font-family': fontFamily }))
  const dotX = x + fontSize * 0.22
  for (let index = 0; index < Math.abs(glyph.octave); index += 1) {
    const upper = glyph.octave > 0
    group.append(svg('circle', { cx: dotX, cy: y + (upper ? -fontSize * (0.95 + index * 0.18) : fontSize * (0.22 + index * 0.18)), r: Math.max(1.55, fontSize * 0.075), class: 'octave-dot' }))
  }
}

function relationArc(x1: number, x2: number, y: number, peak: number, className: string) {
  const middle = (x1 + x2) / 2
  return svg('path', { d: `M ${x1} ${y} Q ${middle} ${peak} ${x2} ${y}`, class: className })
}

function renderBarline(group: SVGGElement, type: string | undefined, x: number) {
  const thin = (x: number) => group.append(svg('line', { x1: x, x2: x, y1: -40, y2: 26, class: 'barline-thin' }))
  if (!type) return
  if (type === 'single') { thin(x); return }
  const repeatStart = type === 'rptstart'
  const repeatEnd = type === 'rptend'
  const thickX = repeatStart ? x : x - 4.5
  const thinX = repeatStart ? x + 4.5 : x
  group.append(svg('line', { x1: thickX, x2: thickX, y1: -40, y2: 26, class: 'barline-thick' }))
  thin(thinX)
  if (repeatStart || repeatEnd) {
    const dotX = repeatStart ? x + 10 : x - 10
    group.append(svg('circle', { cx: dotX, cy: -16, r: 2.1, class: 'repeat-dot' }))
    group.append(svg('circle', { cx: dotX, cy: 0, r: 2.1, class: 'repeat-dot' }))
  }
}

function appendEventSymbol(group: SVGGElement, item: PositionedEvent, key: string, fontFamily: string) {
  const center = item.x + item.width / 2
  const event = item.event
  if (event.kind === 'rest') {
    group.append(text('0', { x: center, y: 0, class: 'event-symbol', 'font-family': fontFamily }))
    return
  }
  if (event.kind === 'chord') {
    const spacing = Math.max(18, NOTE_SIZE * 0.73)
    const start = -spacing * (event.pitches.length - 1) / 2
    for (const [index, pitch] of event.pitches.entries()) appendPitch(group, pitch, center, start + index * spacing, key, fontFamily, event.octaveShift, 0.78)
    return
  }
  if (event.kind === 'tuplet' && event.tuplet) {
    const childWidth = Math.min(Math.max(12, item.width / Math.max(1, event.pitches.length)), NOTE_SIZE * 0.78)
    const start = center - childWidth * (event.pitches.length - 1) / 2
    for (const [index, pitch] of event.pitches.entries()) {
      if (pitch === '0') group.append(text('0', { x: start + index * childWidth, y: 0, class: 'event-symbol', 'font-size': NOTE_SIZE * 0.76, 'font-family': fontFamily }))
      else appendPitch(group, pitch, start + index * childWidth, 0, key, fontFamily, event.octaveShift, 0.76)
    }
    const arcStart = start - childWidth * 0.38
    const arcEnd = start + childWidth * Math.max(0.6, event.pitches.length - 0.62)
    group.append(relationArc(arcStart, arcEnd, -NOTE_SIZE * 0.93, -NOTE_SIZE * 1.35, 'relation-arc tuplet-arc'))
    group.append(text(String(event.tuplet.num), { x: center, y: -NOTE_SIZE * 1.19, 'text-anchor': 'middle', 'font-size': 13, 'font-family': fontFamily }))
    return
  }
  appendPitch(group, event.pitches[0] ?? '1', center, 0, key, fontFamily, event.octaveShift)
}

function rowHeight(measures: readonly ScoreMeasure[], lyrics: ReadonlyMap<ScoreEvent, readonly string[]>) {
  const verses = Math.max(0, ...measures.flatMap((measure) => measure.events.map((event) => lyrics.get(event)?.length ?? 0)))
  const hasTuplets = measures.some((measure) => measure.events.some((event) => event.kind === 'tuplet' || event.postfixes.length > 0 || event.dynamic || event.navigation.length > 0))
  return 84 + Math.max(0, verses - 1) * 21 + (hasTuplets ? 14 : 0) + SYSTEM_GAP
}

function textWidth(value: string, fontSize: number) {
  return [...value].reduce((width, character) => width + (/[\u2e80-\u9fff]/u.test(character) ? fontSize : fontSize * 0.62), 0)
}

/** Conservative pre-layout footprint.  It deliberately reserves space for
 * the widest visible child so SVG paint never has to resolve collisions. */
function eventMinimumWidth(event: ScoreEvent, lyrics: ReadonlyMap<ScoreEvent, readonly string[]>, inlineSettings: ReadonlyMap<ScoreEvent, string>) {
  const noteWidth = event.kind === 'tuplet'
    ? Math.max(NOTE_SIZE * 1.28, event.pitches.length * NOTE_SIZE * 0.61)
    : event.kind === 'chord' ? NOTE_SIZE * 1.22 : NOTE_SIZE * 1.08
  const lyricWidth = Math.max(0, ...(lyrics.get(event) ?? []).map((value) => textWidth(value, 16) + 8))
  const settingWidth = inlineSettings.has(event) ? textWidth(inlineSettings.get(event) ?? '', 15) + 12 : 0
  const graceWidth = graceText(event.postfixes) ? NOTE_SIZE * 1.35 : 0
  return Math.max(noteWidth, lyricWidth, settingWidth, graceWidth)
}

function renderMeasure(
  lyricsByEvent: ReadonlyMap<ScoreEvent, readonly string[]>,
  inlineSettings: ReadonlyMap<ScoreEvent, string>,
  measure: ScoreMeasure,
  index: number,
  layout: RenderRow['layout'],
  placement: LayoutMeasure,
  key: string,
  fontFamily: string,
  beat: number,
  measureId: string,
) {
  const group = svg('g', { class: 'measure', id: measureId, 'data-measure-number': index + 1 })
  group.append(svg('rect', { x: 0, y: -49, width: layout.width, height: 104, rx: 0, class: 'measure-cursor-highlight' }))
  group.append(svg('rect', { x: 0, y: -49, width: layout.width, height: 104, rx: 0, class: 'measure-playback-highlight' }))
  if (measure.multiRest) {
    group.append(text(String(measure.multiRest), { x: layout.width / 2, y: -6, class: 'event-symbol', 'font-size': 26, 'font-family': fontFamily }))
    group.append(svg('line', { x1: 16, x2: layout.width - 16, y1: 7, y2: 7, class: 'barline-thin' }))
    group.append(svg('rect', { x: layout.width / 2 - 5, y: 3, width: 10, height: 8, fill: '#111' }))
  }
  for (const item of layout.events) {
    const event = item.event
    const note = svg('g', { class: 'jianpu-event', id: item.id, 'data-source-start': event.sourceStart, 'data-source-end': event.sourceEnd })
    note.append(svg('rect', { x: item.x, y: -50, width: item.width, height: 104, rx: 2, class: 'event-bg' }))
    appendEventSymbol(note, item, key, fontFamily)
    const lyrics = lyricsByEvent.get(event) ?? []
    lyrics.forEach((value, verse) => note.append(text(value, { x: item.x + item.width / 2, y: NOTE_SIZE * (1.48 + verse * 0.67), class: 'event-lyric', 'font-family': fontFamily })))
    if (event.postfixes.includes('tip')) note.append(svg('circle', { cx: item.x + item.width / 2, cy: -NOTE_SIZE * 0.63, r: 2.1, class: 'duration-dot' }))
    if (event.postfixes.includes('tr')) note.append(text('tr', { x: item.x + item.width * 0.73, y: -NOTE_SIZE * 0.58, class: 'event-dynamic', 'font-family': fontFamily }))
    if (event.dynamic) note.append(text(event.dynamic, { x: item.x + item.width / 2, y: NOTE_SIZE * 0.94, class: 'event-dynamic', 'text-anchor': 'middle', 'font-family': fontFamily }))
    const grace = graceText(event.postfixes)
    if (grace) note.append(text(grace, { x: item.x + item.width * 0.08, y: -NOTE_SIZE * 0.36, 'font-size': 12, 'font-style': 'italic', 'font-family': fontFamily }))
    group.append(note)
  }
  for (let eventIndex = 0; eventIndex < layout.events.length - 1; eventIndex += 1) {
    const source = layout.events[eventIndex]
    const target = layout.events[eventIndex + 1]
    if (source?.event.tie && target) group.append(relationArc(source.x + source.width * 0.72, target.x + target.width * 0.28, -NOTE_SIZE * 0.72, -NOTE_SIZE * 1.02, 'relation-arc tie-arc'))
  }
  for (const item of layout.events) {
    const setting = inlineSettings.get(item.event)
    if (setting) group.append(text(setting, { x: item.x + item.width / 2, y: -NOTE_SIZE * 1.7, class: 'm3n-jianpu-inline-setting', 'text-anchor': 'middle', 'font-family': fontFamily }))
    for (const navigation of item.event.navigation) {
      const label = NAVIGATION_LABELS[navigation]
      if (label) group.append(text(label, { x: item.x + item.width / 2, y: navigation === 'segno' ? -NOTE_SIZE * 1.04 : NOTE_SIZE * 1.1, class: 'm3n-jianpu-navigation', 'text-anchor': 'middle', 'font-size': navigation === 'segno' ? 24 : 15, 'font-family': fontFamily }))
    }
  }
  renderBarline(group, measure.left, 0)
  renderBarline(group, measure.right, layout.width)
  const duration = renderDurationLines(positionEvents(placement, beat), beat, NOTE_SIZE, layout.width)
  if (duration) {
    const marker = svg('g', { class: 'm3n-jianpu-duration-lines' })
    marker.innerHTML = duration
    group.append(marker)
  }
  if (measure.ending) {
    group.append(svg('path', { d: `M 3 -43 V -58 H ${layout.width - 8}`, class: 'ending-bracket' }))
    group.append(text(`${measure.ending}.`, { x: 9, y: -46, 'font-size': 15, 'font-weight': '700', 'font-family': fontFamily, class: 'm3n-jianpu-ending' }))
  }
  return group
}

function addIntervals(document: ScoreDocument, eventBoxes: readonly EventBox[], fontFamily: string) {
  for (const interval of document.intervals) {
    const start = eventBoxes.find((box) => box.event.sourceStart >= (interval.start ?? Number.POSITIVE_INFINITY))
    const end = [...eventBoxes].reverse().find((box) => box.event.sourceEnd <= (interval.end ?? Number.NEGATIVE_INFINITY) && box.page === start?.page)
    if (!start || !end || start.page !== end.page) continue
    const y = Math.min(start.y, end.y) - NOTE_SIZE * 1.46
    const label = interval.kind === 'decres' ? '>' : interval.kind === 'cresc' ? '<' : interval.kind === '8va' ? '8va' : interval.kind === '8vb' ? '8vb' : interval.kind === 'accel' ? `accel. ${interval.tempoTarget ?? ''}` : interval.kind === 'rit' ? `rit. ${interval.tempoTarget ?? ''}` : interval.kind
    if (interval.display === 'text' || !['cresc', 'decres'].includes(interval.kind)) start.page.append(text(label, { x: start.x, y, class: 'm3n-jianpu-interval', 'font-family': fontFamily }))
    else start.page.append(svg('path', { d: `M ${start.x} ${y} L ${end.x} ${y - 5} L ${end.x} ${y + 5} Z`, fill: 'none', stroke: '#111', 'stroke-width': 1.3, class: 'm3n-jianpu-hairpin' }))
  }
}

export class JianpuScore {
  private constructor(private readonly pages: SVGSVGElement[], private readonly paged: boolean) {}

  static create(document: ScoreDocument, options: JianpuScoreOptions) {
    // Match score-header-svg and the staff renderer's ordinary text layer.
    const fontFamily = options.fontFamily ?? 'system-ui, sans-serif'
    const compact = options.compact ?? false
    const width = Math.max(320, options.width)
    const beat = 4 / Math.max(1, document.meterUnit)
    const eventIds = stableEventIds(document)
    const lyricsByEvent = lyricIndex(document)
    const inlineSettings = inlineSettingIndex(document)
    const rows: RenderRow[] = []
    let y = SYSTEM_TOP
    let partIndex = 0

    for (const [partId, part] of document.parts.entries()) {
      const voices: Array<{ id: string; staff: 'melody' | 'bass'; measures: ScoreMeasure[] }> = [{ id: partId, staff: 'melody', measures: part.melody }]
      if (part.bass.some((measure) => measure.events.length > 0 || measure.multiRest)) voices.push({ id: `${partId}:bass`, staff: 'bass', measures: part.bass })
      for (const voice of voices) {
        const placements = layoutMeasures(voice.measures, width, PADDING, 0, 1, NOTE_SIZE, beat, {
          eventMinimumWidth: (event) => eventMinimumWidth(event, lyricsByEvent, inlineSettings),
        })
        const originalRows = [...new Set(placements.map((placement) => placement.y))]
        const rowY = new Map<number, number>()
        for (const originalY of originalRows) {
          rowY.set(originalY, y)
          const measures = placements.filter((placement) => placement.y === originalY).map((placement) => placement.measure)
          y += rowHeight(measures, lyricsByEvent)
        }
        for (const placement of placements) {
          const rawLayout = measureLayout(placement.measure, placement.measureIndex, compact, eventIds)
          rows.push({ voiceId: voice.id, partIndex, staff: voice.staff, placement, layout: alignMeasureLayout(rawLayout, placement, beat), y: rowY.get(placement.y) ?? y, height: rowHeight([placement.measure], lyricsByEvent) })
        }
        y += SYSTEM_GAP
      }
      partIndex += 1
    }

    const pageWidth = Math.max(width, ...rows.map((row) => row.placement.x + row.layout.width + PADDING))
    const naturalHeight = Math.max(220, y + PADDING)
    const pageHeight = options.paged ? Math.max(a4SourcePageHeight(pageWidth), 420) : naturalHeight
    const pages: SVGSVGElement[] = []
    let page = svg('svg', { xmlns: SVG_NS, viewBox: `0 0 ${pageWidth} ${pageHeight}`, width: pageWidth, height: pageHeight, class: 'jianpu-page' })
    addJianpuStyle(page, fontFamily)
    let pageIndex = 0
    let pageOffset = 0
    let previous: RenderRow | undefined
    const eventBoxes: EventBox[] = []

    for (const row of rows) {
      if (options.paged && row.y - pageOffset + row.height > pageHeight - PADDING && page.childElementCount > 1) {
        pages.push(page)
        pageIndex += 1
        pageOffset = row.y - SYSTEM_TOP
        page = svg('svg', { xmlns: SVG_NS, viewBox: `0 0 ${pageWidth} ${pageHeight}`, width: pageWidth, height: pageHeight, class: 'jianpu-page', 'data-render-page': pageIndex + 1 })
        addJianpuStyle(page, fontFamily)
        previous = undefined
      }
      const voiceSuffix = row.staff === 'bass' ? '-bass' : ''
      const measureId = `m3n-measure-${row.partIndex + 1}-${row.placement.measureIndex + 1}${voiceSuffix}`
      const rendered = renderMeasure(lyricsByEvent, inlineSettings, row.placement.measure, row.placement.measureIndex, row.layout, row.placement, document.key, fontFamily, beat, measureId)
      const renderedY = row.y - pageOffset
      rendered.setAttribute('transform', `translate(${row.placement.x},${renderedY})`)
      rendered.setAttribute('data-m3n-voice', row.voiceId)
      page.append(rendered)
      for (const event of row.layout.events) eventBoxes.push({ event: event.event, x: row.placement.x + event.x + event.width / 2, y: renderedY, page })
      const source = previous?.layout.events.at(-1)
      const target = row.layout.events[0]
      if (previous && previous.voiceId === row.voiceId && source?.event.tie && target) {
        const x1 = previous.placement.x + source.x + source.width * 0.72
        const x2 = row.placement.x + target.x + target.width * 0.28
        const priorY = previous.y - pageOffset - NOTE_SIZE * 0.72
        const targetY = renderedY - NOTE_SIZE * 0.72
        if (previous.y === row.y) page.append(relationArc(x1, x2, targetY, targetY - NOTE_SIZE * 0.3, 'relation-arc tie-arc cross-measure-tie'))
        else {
          page.append(relationArc(x1, pageWidth - PADDING, priorY, priorY - NOTE_SIZE * 0.3, 'relation-arc tie-arc cross-system-tie-out'))
          page.append(relationArc(PADDING, x2, targetY, targetY - NOTE_SIZE * 0.3, 'relation-arc tie-arc cross-system-tie-in'))
        }
      }
      previous = row
    }
    pages.push(page)
    addIntervals(document, eventBoxes, fontFamily)
    const signature = text(`1=${document.key}    ${document.meterCount}/${document.meterUnit}    ♩=${document.tempo}`, { x: PADDING, y: 54, class: 'm3n-jianpu-signature', 'font-family': fontFamily })
    pages[0]?.append(signature)
    if (pages[0]) addScoreHeaderToSvg(pages[0], options.headerMetadata, pageWidth, pageHeight)
    return new JianpuScore(pages, options.paged)
  }

  attach(paper: HTMLElement) {
    paper.innerHTML = ''
    for (const page of this.pages) {
      const clone = page.cloneNode(true) as SVGSVGElement
      if (this.paged) {
        const sheet = document.createElement('div')
        sheet.className = 'score-page-sheet'
        sheet.append(clone)
        paper.append(sheet)
      } else paper.append(clone)
    }
  }

  pagesClone() { return this.pages.map((page) => page.cloneNode(true) as SVGSVGElement) }
  destroy() { this.pages.length = 0 }
}
