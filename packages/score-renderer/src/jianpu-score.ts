import type { ScoreDocument, ScoreEvent, ScoreMeasure } from '@m3n/notation'
import { m3nPitchToMidi, jianpuKeyNumber } from '@m3n/notation'
import { a4SourcePageHeight } from './score-export.js'
import { addScoreHeaderToSvg } from './score-header-svg.js'
import { layoutMeasures, positionEvents } from './m3n-jianpu-layout.js'
import { renderDurationLines } from './m3n-jianpu-duration-lines.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const PADDING = 28
const NOTE_SIZE = 32
const ROW_HEIGHT = 112
const SYSTEM_GAP = 24

export type JianpuScoreOptions = {
  width: number
  paged: boolean
  compact?: boolean
  headerMetadata: ReadonlyArray<{ side: 'left' | 'center' | 'right'; value: string; priority: number }>
  fontFamily?: string
}

type PositionedEvent = { event: ScoreEvent; start: number; x: number; width: number; id: string }
const NAVIGATION_LABELS: Record<string, string> = { segno: '𝄋', ds: 'D.S.', dc: 'D.C.', fine: 'Fine' }

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number | undefined> = {}) {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) if (value !== undefined) el.setAttribute(key, String(value))
  return el
}

function addJianpuStyle(page: SVGSVGElement, fontSize: number) {
  const style = svg('style')
  style.textContent = `
    .barline-thin,.barline-thick,.ending-bracket{stroke:#33483f;fill:none}
    .barline-thin{stroke-width:1.6}.barline-thick{stroke-width:4.2}.repeat-dot,.octave-dot,.duration-dot{fill:#33483f}
    .jianpu-event{cursor:pointer}.event-bg{fill:transparent;transition:fill .12s ease,stroke .12s ease}
    .event-symbol,.duration-extension{font:600 ${fontSize}px 'Microsoft YaHei','Noto Sans SC',sans-serif;fill:#1f332a;text-anchor:middle}
    .event-lyric{font:15px 'Microsoft YaHei','Noto Sans SC',sans-serif;fill:#4f6259;text-anchor:middle}
    .relation-arc{fill:none;stroke:#35483f;stroke-width:1.8;stroke-linecap:round}.tie-arc{stroke-width:1.45}.tuplet-arc{stroke-width:1.4}
    .is-source-active .event-bg{fill:#cfe5da;stroke:#4e8069;stroke-width:1.2}.is-highlighted .event-bg{fill:#f7d98b}
  `
  page.prepend(style)
}

function eventDuration(event: ScoreEvent) {
  return Math.max(0.125, event.beats)
}

function pitchText(event: ScoreEvent, key: string) {
  const token = event.pitches[0] ?? '1'
  const midi = m3nPitchToMidi(token, key, event.octaveShift)
  const mapped = mapMidiToJianpu(midi, jianpuKeyNumber(key))
  return `${mapped.accidental}${mapped.degree}${mapped.octave}`
}

function mapMidiToJianpu(midi: number, tonic: number) {
  const scale = [0, 2, 4, 5, 7, 9, 11]
  const rel = midi - (60 + tonic)
  const octave = Math.floor(rel / 12)
  const pc = ((rel % 12) + 12) % 12
  let degree = 0
  let accidental = ''
  let distance = 99
  scale.forEach((value, index) => {
    const candidate = Math.abs(value - pc)
    if (candidate < distance) { distance = candidate; degree = index }
  })
  if (pc !== scale[degree]) accidental = pc > scale[degree]! ? '#' : 'b'
  return { degree: degree + 1, accidental, octave: octave > 0 ? '.'.repeat(octave) : octave < 0 ? ':'.repeat(-octave) : '' }
}

function stableEventIds(document: ScoreDocument) {
  const ids = new Map<ScoreEvent, string>()
  let index = 0
  for (const part of document.parts.values()) {
    const count = Math.max(part.melody.length, part.bass.length)
    for (let measure = 0; measure < count; measure += 1) {
      for (const event of part.melody[measure]?.events ?? []) ids.set(event, `m3n-e-${++index}`)
      for (const event of part.bass[measure]?.events ?? []) ids.set(event, `m3n-e-${++index}`)
    }
  }
  return ids
}

function measureLayout(measure: ScoreMeasure, measureIndex: number, start: number, compact: boolean, ids: ReadonlyMap<ScoreEvent, string>) {
  const events: PositionedEvent[] = []
  let cursor = start
  let x = 0
  for (const [eventIndex, event] of measure.events.entries()) {
    const width = Math.max(compact ? 28 : 34, eventDuration(event) * (compact ? 34 : 42))
    const id = ids.get(event) ?? `m3n-event-${measureIndex + 1}-${eventIndex + 1}`
    events.push({ event, start: cursor, x, width, id })
    cursor += eventDuration(event)
    x += width
  }
  return { events, width: Math.max(48, x + 20), length: cursor - start }
}

function alignMeasureLayout(
  layout: ReturnType<typeof measureLayout>,
  placement: ReturnType<typeof layoutMeasures>[number],
  beat: number,
) {
  const positioned = positionEvents(placement, beat)
  return {
    ...layout,
    width: placement.width,
    events: layout.events.map((item, index) => {
      const positionedEvent = positioned[index]
      if (!positionedEvent) return item
      const width = Math.max(item.width, placement.cellWidth * Math.max(1, positionedEvent.layoutSpan))
      return { ...item, x: positionedEvent.centerX - width / 2, width }
    }),
  }
}

function lyricIndex(document: ScoreDocument) {
  const index = new Map<ScoreEvent, string[]>()
  const melodyEvents = [...document.parts.values()].flatMap((part) => part.melody.flatMap((measure) => measure.events))
  for (const block of document.lyrics) {
    if (block.targetStart === undefined || block.targetEnd === undefined) continue
    const targets = melodyEvents.filter((event) => (
      (event.kind === 'note' || event.kind === 'chord' || event.kind === 'tuplet')
      && event.sourceStart >= block.targetStart!
      && event.sourceEnd <= block.targetEnd!
    ))
    let targetIndex = 0
    for (const syllable of block.syllables) {
      if (syllable.kind === 'extender') continue
      while (targets[targetIndex]?.tie && !syllable.forceTiedTarget) targetIndex += 1
      const target = targets[targetIndex]
      if (!target) break
      if (syllable.kind === 'text' && syllable.text) {
        const current = index.get(target) ?? []
        current.push(syllable.text)
        index.set(target, current)
      }
      targetIndex += 1
    }
  }
  return index
}

/**
 * ScoreEvent carries the effective key, meter, and tempo on every event.
 * Inline notation is only needed where that effective state changes.
 */
function inlineSettingIndex(document: ScoreDocument) {
  const index = new Map<ScoreEvent, string>()
  for (const part of document.parts.values()) {
    for (const measures of [part.melody, part.bass]) {
      let key = document.key
      let meterCount = document.meterCount
      let meterUnit = document.meterUnit
      let tempo = document.tempo
      for (const measure of measures) {
        for (const event of measure.events) {
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
  }
  return index
}

function graceText(postfixes: readonly string[]) {
  const match = postfixes.find((postfix) => /^(ac|ap)\[/.test(postfix))
  if (!match) return undefined
  const pitches = /\[([^\]]+)\]/.exec(match)?.[1]
  return pitches?.replaceAll(/[()]/g, '')
}

function arc(x1: number, x2: number, y: number, peak: number, className: string) {
  const mid = (x1 + x2) / 2
  return svg('path', { d: `M ${x1} ${y} Q ${mid} ${peak} ${x2} ${y}`, class: className, fill: 'none', stroke: '#35483f', 'stroke-width': 1.6, 'stroke-linecap': 'round' })
}

function barline(group: SVGGElement, type: string | undefined, x: number) {
  if (!type || type === 'single') {
    group.append(svg('line', { x1: x, x2: x, y1: -30, y2: 16, stroke: '#33483f', 'stroke-width': 1.6, class: 'barline-thin' }))
    return
  }
  const repeatStart = type === 'rptstart'
  const repeatEnd = type === 'rptend'
  const final = type === 'final' || repeatEnd
  const thickX = repeatStart ? x : x - 5
  const thinX = repeatStart ? x + 5 : x
  group.append(svg('line', { x1: thickX, x2: thickX, y1: -30, y2: 16, stroke: '#33483f', 'stroke-width': final || repeatStart ? 4.2 : 1.6, class: final || repeatStart ? 'barline-thick' : 'barline-thin' }))
  group.append(svg('line', { x1: thinX, x2: thinX, y1: -30, y2: 16, stroke: '#33483f', 'stroke-width': 1.6, class: 'barline-thin' }))
  if (repeatStart || repeatEnd) {
    const dotX = repeatStart ? x + 11 : x - 11
    group.append(svg('circle', { cx: dotX, cy: -16, r: 2.1, fill: '#33483f', class: 'repeat-dot' }))
    group.append(svg('circle', { cx: dotX, cy: -4, r: 2.1, fill: '#33483f', class: 'repeat-dot' }))
  }
}

function renderMeasure(lyricsByEvent: ReadonlyMap<ScoreEvent, readonly string[]>, inlineSettings: ReadonlyMap<ScoreEvent, string>, measure: ScoreMeasure, index: number, layout: ReturnType<typeof measureLayout>, placement: ReturnType<typeof layoutMeasures>[number], key: string, fontFamily: string, beat: number, measureId: string) {
  const group = svg('g', { class: 'measure', id: measureId, 'data-measure-number': index + 1 })
  for (const item of layout.events) {
    const note = svg('g', { class: 'jianpu-event', id: item.id, 'data-source-start': item.event.sourceStart, 'data-source-end': item.event.sourceEnd, transform: `translate(${item.x},0)` })
    const text = svg('text', { x: item.width / 2, y: 0, 'text-anchor': 'middle', 'font-size': NOTE_SIZE, 'font-family': fontFamily, fill: '#20242b' })
    text.textContent = item.event.kind === 'rest' ? '0' : item.event.kind === 'chord' ? item.event.pitches.map((pitch) => pitchText({ ...item.event, pitches: [pitch] }, key)).join('') : pitchText(item.event, key)
    note.append(text)
    const lyrics = lyricsByEvent.get(item.event) ?? []
    if (lyrics.length > 0) {
      lyrics.forEach((text, verse) => {
        const lyric = svg('text', { x: item.width / 2, y: NOTE_SIZE * (1.45 + verse * 0.62), 'text-anchor': 'middle', class: 'event-lyric', 'font-size': 15, 'font-family': fontFamily, fill: '#4f6259' })
        lyric.textContent = text
        note.append(lyric)
      })
    }
    if (item.event.postfixes.includes('tip')) note.append(svg('circle', { cx: item.width / 2, cy: -NOTE_SIZE * 0.62, r: 2.2, fill: '#20242b' }))
    if (item.event.postfixes.includes('tr')) { const trill = svg('text', { x: item.width / 2 + 13, y: -10, 'font-size': 16, 'font-family': fontFamily, 'font-style': 'italic' }); trill.textContent = 'tr'; note.append(trill) }
    if (item.event.dynamic) { const dynamic = svg('text', { x: item.width / 2, y: NOTE_SIZE * 0.95, 'text-anchor': 'middle', 'font-size': 15, 'font-family': fontFamily, 'font-style': 'italic' }); dynamic.textContent = item.event.dynamic; note.append(dynamic) }
    const grace = graceText(item.event.postfixes)
    if (grace) {
      const ornament = svg('text', { x: item.width * 0.05, y: -NOTE_SIZE * 0.3, 'font-size': 13, 'font-family': fontFamily, 'font-style': 'italic', fill: '#20242b' })
      ornament.textContent = grace
      note.append(ornament)
    }
    group.append(note)
  }
  for (let eventIndex = 0; eventIndex < layout.events.length - 1; eventIndex += 1) {
    const current = layout.events[eventIndex]
    const next = layout.events[eventIndex + 1]
    if (!current || !next || !current.event.tie) continue
    group.append(arc(current.x + current.width * 0.7, next.x + next.width * 0.3, -NOTE_SIZE * 0.72, -NOTE_SIZE * 1.05, 'relation-arc tie-arc'))
  }
  for (const event of layout.events) {
    if (!event) continue
    for (const navigation of event.event.navigation) {
      const label = NAVIGATION_LABELS[navigation]
      if (!label) continue
      const text = svg('text', { x: event.x + event.width / 2, y: navigation === 'segno' ? -NOTE_SIZE * 1.05 : NOTE_SIZE * 1.05, 'text-anchor': 'middle', 'font-size': navigation === 'segno' ? 24 : 15, 'font-family': fontFamily, fill: '#7f3f25' })
      text.textContent = label
      group.append(text)
    }
    if (event.event.tuplet) {
      const start = event.x + 4
      const end = event.x + event.width - 4
      group.append(arc(start, end, -NOTE_SIZE * 1.04, -NOTE_SIZE * 1.45, 'relation-arc tuplet-arc'))
      const number = svg('text', { x: (start + end) / 2, y: -NOTE_SIZE * 1.32, 'text-anchor': 'middle', 'font-size': 15, 'font-family': fontFamily })
      number.textContent = String(event.event.tuplet.num)
      group.append(number)
    }
    const setting = inlineSettings.get(event.event)
    if (setting) {
      const signature = svg('text', { x: event.x + event.width / 2, y: -NOTE_SIZE * 1.55, 'text-anchor': 'middle', 'font-size': 13, 'font-family': fontFamily, fill: '#a4522c', 'font-weight': '700', class: 'm3n-jianpu-inline-setting' })
      signature.textContent = setting
      group.append(signature)
    }
  }
  barline(group, measure.left, 0)
  barline(group, measure.right, layout.width)
  const positioned = positionEvents(placement, beat)
  const duration = renderDurationLines(positioned, beat, NOTE_SIZE, layout.width)
  if (duration) {
    const marker = globalThis.document.createElementNS(SVG_NS, 'g')
    marker.setAttribute('class', 'm3n-jianpu-duration-lines')
    marker.innerHTML = duration
    group.append(marker)
  }
  if (measure.ending) {
    group.append(svg('path', { d: `M 3 -36 V -52 H ${layout.width - 8}`, fill: 'none', stroke: '#33483f', 'stroke-width': 1.5, class: 'ending-bracket' }))
    const ending = svg('text', { x: 9, y: -39, 'font-size': 16, 'font-family': fontFamily, fill: '#20242b', 'font-weight': '700' })
    ending.textContent = `${measure.ending}.`
    group.append(ending)
  }
  return group
}

export class JianpuScore {
  private constructor(private readonly pages: SVGSVGElement[], private readonly paged: boolean) {}

  static create(document: ScoreDocument, options: JianpuScoreOptions) {
    const fontFamily = options.fontFamily ?? 'system-ui, sans-serif'
    const compact = options.compact ?? false
    const maxWidth = Math.max(320, options.width)
    const beat = 4 / Math.max(1, document.meterUnit)
    const voices = [...document.parts.entries()].flatMap(([partId, part], partIndex) => [
      { id: partId, partIndex, staff: 'melody', measures: part.melody },
      ...(part.bass.some((measure) => measure.events.length > 0) ? [{ id: `${partId}:bass`, partIndex, staff: 'bass', measures: part.bass }] : []),
    ])
    const lyricsByEvent = lyricIndex(document)
    const inlineSettings = inlineSettingIndex(document)
    const eventIds = stableEventIds(document)
    const renderRows: Array<{ id: string; partIndex: number; placement: ReturnType<typeof layoutMeasures>[number]; layout: ReturnType<typeof measureLayout> }> = []
    let voiceTop = 80
    for (const voice of voices) {
      const placements = layoutMeasures(voice.measures, maxWidth, PADDING, voiceTop, ROW_HEIGHT + SYSTEM_GAP, NOTE_SIZE, beat)
      for (const placement of placements) {
        const rawLayout = measureLayout(placement.measure, placement.measureIndex, 0, compact, eventIds)
        renderRows.push({ id: voice.id, partIndex: voice.partIndex, placement, layout: alignMeasureLayout(rawLayout, placement, beat) })
      }
      voiceTop = Math.max(voiceTop + ROW_HEIGHT, (placements.at(-1)?.y ?? voiceTop) + ROW_HEIGHT + SYSTEM_GAP)
    }
    const pageWidth = Math.max(maxWidth, ...renderRows.map((item) => item.placement.x + item.placement.width + PADDING))
    const naturalHeight = Math.max(220, voiceTop + PADDING)
    const targetPageHeight = options.paged ? Math.max(a4SourcePageHeight(pageWidth), 420) : naturalHeight
    const pages: SVGSVGElement[] = []
    let page = svg('svg', { xmlns: SVG_NS, viewBox: `0 0 ${pageWidth} ${targetPageHeight}`, width: pageWidth, height: targetPageHeight, class: 'jianpu-page' })
    addJianpuStyle(page, NOTE_SIZE)
    let pageIndex = 0
    let pageYOffset = 0
    let previous: typeof renderRows[number] | undefined
    const eventBoxes: Array<{ event: ScoreEvent; x: number; y: number; page: SVGSVGElement }> = []
    for (const item of renderRows) {
      if (options.paged && item.placement.y - pageYOffset + ROW_HEIGHT > targetPageHeight - PADDING && page.childElementCount > 0) {
        pages.push(page); pageIndex += 1; pageYOffset = item.placement.y - 80
        page = svg('svg', { xmlns: SVG_NS, viewBox: `0 0 ${pageWidth} ${targetPageHeight}`, width: pageWidth, height: targetPageHeight, class: 'jianpu-page', 'data-render-page': pageIndex + 1 })
        addJianpuStyle(page, NOTE_SIZE)
        previous = undefined
      }
      const measureId = `m3n-measure-${item.partIndex + 1}-${item.placement.measureIndex + 1}${item.id.endsWith(':bass') ? '-bass' : ''}`
      const measureY = item.placement.y - pageYOffset
      const group = renderMeasure(lyricsByEvent, inlineSettings, item.placement.measure, item.placement.measureIndex, item.layout, item.placement, document.key, fontFamily, beat, measureId)
      group.setAttribute('transform', `translate(${item.placement.x},${measureY})`)
      group.setAttribute('data-m3n-voice', item.id)
      page.append(group)
      for (const event of item.layout.events) eventBoxes.push({ event: event.event, x: item.placement.x + event.x + event.width / 2, y: item.placement.y - pageYOffset, page })
      const source = previous?.layout.events.at(-1)
      const target = item.layout.events[0]
      if (previous && previous.id === item.id && source?.event.tie && target) {
        const x1 = previous.placement.x + source.x + source.width * 0.7
        const x2 = item.placement.x + target.x + target.width * 0.3
        const baseY = item.placement.y - pageYOffset - NOTE_SIZE * 0.72
        if (previous.placement.y === item.placement.y) {
          page.append(arc(x1, x2, baseY, baseY - NOTE_SIZE * 0.33, 'relation-arc tie-arc cross-measure-tie'))
        } else {
          page.append(arc(item.placement.x + 2, x2, baseY, baseY - NOTE_SIZE * 0.33, 'relation-arc tie-arc cross-system-tie-in'))
          const priorY = previous.placement.y - pageYOffset - NOTE_SIZE * 0.72
          page.append(arc(x1, pageWidth - PADDING, priorY, priorY - NOTE_SIZE * 0.33, 'relation-arc tie-arc cross-system-tie-out'))
        }
      }
      previous = item
    }
    pages.push(page)
    for (const interval of document.intervals) {
      const start = eventBoxes.find((box) => box.event.sourceStart >= (interval.start ?? Number.POSITIVE_INFINITY))
      const end = [...eventBoxes].reverse().find((box) => box.event.sourceEnd <= (interval.end ?? Number.NEGATIVE_INFINITY) && box.page === start?.page)
      if (!start || !end || start.page !== end.page) continue
      const y = Math.min(start.y, end.y) - NOTE_SIZE * 1.35
      const label = interval.kind === 'decres' ? '>' : interval.kind === 'cresc' ? '<' : interval.kind === '8va' ? '8va' : interval.kind === '8vb' ? '8vb' : interval.kind === 'accel' ? `accel. ${interval.tempoTarget ?? ''}` : interval.kind === 'rit' ? `rit. ${interval.tempoTarget ?? ''}` : interval.kind
      if (interval.display === 'text' || !['cresc', 'decres'].includes(interval.kind)) {
        const text = svg('text', { x: start.x, y, 'font-size': 14, 'font-family': fontFamily, 'font-style': 'italic', fill: '#35483f', class: 'm3n-jianpu-interval' })
        text.textContent = label
        start.page.append(text)
      } else {
        start.page.append(svg('path', { d: `M ${start.x} ${y} L ${end.x} ${y - 5} L ${end.x} ${y + 5} Z`, fill: 'none', stroke: '#35483f', 'stroke-width': 1.3, class: 'm3n-jianpu-hairpin' }))
      }
    }
    const signature = svg('text', { x: PADDING, y: 54, 'font-size': 17, 'font-family': fontFamily, fill: '#52655c', class: 'm3n-jianpu-signature' })
    signature.textContent = `1=${document.key}  ${document.meterCount}/${document.meterUnit}  ♩=${document.tempo}`
    pages[0]!.prepend(signature)
    addScoreHeaderToSvg(pages[0]!, options.headerMetadata, pageWidth, targetPageHeight)
    return new JianpuScore(pages, options.paged)
  }

  attach(paper: HTMLElement) { paper.innerHTML = ''; for (const page of this.pages) { const clone = page.cloneNode(true) as SVGSVGElement; if (this.paged) { const sheet = globalThis.document.createElement('div'); sheet.className = 'score-page-sheet'; sheet.append(clone); paper.append(sheet) } else paper.append(clone) } }
  pagesClone() { return this.pages.map((page) => page.cloneNode(true) as SVGSVGElement) }
  destroy() { this.pages.length = 0 }
}
