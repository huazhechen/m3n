import type { ScoreDocument, ScoreEvent, ScoreHeaderMetadata } from '@m3n/notation'
import { m3nPitch } from '@m3n/notation'
import { addScoreHeaderToSvg } from './score-header-svg.js'
import { buildNumberedLayout, type NumberedEventPlacement, type NumberedSystem } from './numbered-layout.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

export type NumberedScoreOptions = {
  width: number
  paged?: boolean
  compact?: boolean
  headerMetadata: readonly ScoreHeaderMetadata[]
  fontSize?: number
  pageHeight?: number
}

type LyricMap = Map<ScoreEvent, string[]>

function node<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number | undefined> = {}) {
  const element = document.createElementNS(SVG_NS, tag)
  Object.entries(attrs).forEach(([key, value]) => { if (value !== undefined) element.setAttribute(key, String(value)) })
  return element
}

function label(value: string, attrs: Record<string, string | number | undefined> = {}) {
  const element = node('text', attrs)
  element.textContent = value
  return element
}

function pitchGlyph(token: string) {
  const match = /^(?:([1-7])([#b=]*)([ed]*)|0)/.exec(token)
  if (!match || match[0] === '0') return { degree: '0', accidental: '', octave: 0 }
  const octave = [...(match[3] ?? '')].reduce((sum, mark) => sum + (mark === 'e' ? 1 : -1), 0)
  return { degree: match[1] ?? '0', accidental: match[2] ?? '', octave }
}

function lyricIndex(document: ScoreDocument): LyricMap {
  const events = [...document.parts.values()].flatMap((part) => part.melody.flatMap((measure) => measure.events))
    .filter((event) => event.kind === 'note' || event.kind === 'chord' || event.kind === 'tuplet')
  const index: LyricMap = new Map()
  for (const block of document.lyrics) {
    const targets = events.filter((event) => block.targetStart === undefined || block.targetEnd === undefined || (event.sourceStart >= block.targetStart && event.sourceEnd <= block.targetEnd))
    let targetIndex = 0
    for (const syllable of block.syllables) {
      if (syllable.kind !== 'text' || !syllable.text) continue
      while (targets[targetIndex]?.tie && !syllable.forceTiedTarget) targetIndex += 1
      const target = targets[targetIndex++]
      if (target) index.set(target, [...(index.get(target) ?? []), syllable.text])
    }
  }
  return index
}

function eventLabelWidth(event: ScoreEvent, lyrics: LyricMap, fontSize: number) {
  const lyric = lyrics.get(event)?.join('') ?? ''
  const pitch = event.pitches.join('')
  return Math.max(fontSize * 0.9, (lyric.length + pitch.length * 0.28) * fontSize * 0.52)
}

function style(svg: SVGSVGElement, fontSize: number) {
  const sheet = node('style')
  sheet.textContent = `.numbered-score{background:#fff}.numbered-event{cursor:pointer}.numbered-symbol{font:600 ${fontSize}px 'Times New Roman','Noto Serif',serif;fill:#111;text-anchor:middle}.numbered-accidental{font:600 ${fontSize * 0.62}px serif;fill:#111;text-anchor:end}.numbered-lyric{font:16px system-ui,sans-serif;fill:#30363e;text-anchor:middle}.numbered-label{font:14px system-ui,sans-serif;fill:#30363e;text-anchor:middle}.numbered-bar{stroke:#111;stroke-width:1.2}.numbered-repeat{stroke:#111;stroke-width:3}.numbered-duration{stroke:#111;stroke-width:1.4}.numbered-relation{fill:none;stroke:#111;stroke-width:1.2}.is-playing .numbered-symbol,.is-playing .numbered-lyric,.numbered-symbol.is-playing,.numbered-lyric.is-playing{fill:#1d6fa5}.is-source-active .numbered-symbol,.is-source-active .numbered-lyric{fill:#245b45}.is-playing-measure{fill:#eaf4fb}`
  svg.prepend(sheet)
}

function drawPitch(group: SVGGElement, token: string, x: number, y: number, key: string, fontSize: number, offset = 0) {
  const glyph = pitchGlyph(token)
  const parsed = glyph.degree === '0' ? undefined : m3nPitch(token, key)
  const accidental = glyph.accidental || (parsed?.accid === 's' ? '#' : parsed?.accid === 'f' ? 'b' : parsed?.accid === 'n' ? '=' : '')
  if (accidental) group.append(label(accidental === 'ss' ? 'x' : accidental === 'ff' ? 'bb' : accidental, { x: x - fontSize * 0.38, y: y + offset, class: 'numbered-accidental' }))
  group.append(label(glyph.degree, { x, y: y + offset, class: 'numbered-symbol' }))
  for (let dot = 0; dot < Math.abs(glyph.octave); dot += 1) group.append(node('circle', { cx: x + fontSize * 0.25, cy: y + offset + (glyph.octave > 0 ? -fontSize * (0.74 + dot * 0.16) : fontSize * (0.16 + dot * 0.16)), r: 2.1, fill: '#111' }))
}

function renderEvent(group: SVGGElement, placement: NumberedEventPlacement, key: string, fontSize: number, lyrics: LyricMap, id: string) {
  const { event } = placement
  group.setAttribute('id', id)
  group.setAttribute('data-m3n-id', id)
  group.setAttribute('data-source-start', String(event.sourceStart))
  group.setAttribute('data-source-end', String(event.sourceEnd))
  group.classList.add('numbered-event')
  group.append(node('rect', { x: placement.x, y: -fontSize * 1.05, width: placement.width, height: fontSize * 2.8, fill: 'transparent' }))
  if (event.kind === 'rest') drawPitch(group, '0', placement.center, 0, key, fontSize)
  else if (event.pitches.length === 0) drawPitch(group, '0', placement.center, 0, key, fontSize)
  else if (event.pitches.length === 1) drawPitch(group, event.pitches[0] ?? '0', placement.center, 0, key, fontSize)
  else event.pitches.forEach((pitch, index) => drawPitch(group, pitch, placement.center, (index - (event.pitches.length - 1) / 2) * fontSize * 0.52, key, fontSize * 0.8))
  if (event.beats < 1) {
    const lines = Math.max(1, Math.round(Math.log2(1 / Math.max(0.125, event.beats))))
    for (let line = 0; line < lines; line += 1) group.append(node('line', { x1: placement.x + fontSize * 0.18, x2: placement.x + placement.width - fontSize * 0.18, y1: fontSize * 0.68 + line * 5, y2: fontSize * 0.68 + line * 5, class: 'numbered-duration' }))
  }
  const lyric = lyrics.get(event)?.join('')
  if (lyric) group.append(label(lyric, { x: placement.center, y: fontSize * 2.05, class: 'numbered-lyric' }))
  if (event.chord) group.append(label(event.chord, { x: placement.center, y: -fontSize * 1.45, class: 'numbered-label' }))
  if (event.dynamic || event.text) group.append(label(event.dynamic ?? event.text ?? '', { x: placement.center, y: -fontSize * 1.95, class: 'numbered-label' }))
}

function drawMeasure(parent: SVGGElement, item: NumberedSystem['measures'][number], document: ScoreDocument, lyrics: LyricMap, ids: Map<ScoreEvent, string>, fontSize: number) {
  const measure = node('g', { class: 'measure', 'data-measure-index': item.index })
  item.placements.forEach((placement) => {
    const eventGroup = node('g')
    renderEvent(eventGroup, placement, placement.event.key || document.key, fontSize, lyrics, ids.get(placement.event) ?? `m3n-e-${item.index + 1}-${placement.eventIndex + 1}`)
    measure.append(eventGroup)
  })
  parent.append(measure)
  const lineX = item.x + item.width - fontSize * 0.25
  measure.append(node('line', { x1: lineX, x2: lineX, y1: -fontSize * 1.15, y2: fontSize * 1.55, class: item.measure.right === 'repeat' ? 'numbered-repeat' : 'numbered-bar' }))
  if (item.measure.left) measure.append(node('line', { x1: item.x, x2: item.x, y1: -fontSize * 1.15, y2: fontSize * 1.55, class: 'numbered-bar' }))
  if (item.measure.ending) measure.append(label(`${item.measure.ending}.`, { x: item.x + fontSize * 0.25, y: -fontSize * 1.3, class: 'numbered-label' }))
}

export class NumberedScore {
  private constructor(private readonly pages: SVGSVGElement[]) {}

  static create(document: ScoreDocument, options: NumberedScoreOptions) {
    const width = Math.max(320, options.width)
    const fontSize = options.fontSize ?? (options.compact ? 22 : 30)
    const lyrics = lyricIndex(document)
    const ids = new Map<ScoreEvent, string>()
    let id = 0
    const parts = [...document.parts.entries()]
    parts.forEach(([, part]) => [...part.melody, ...part.bass].forEach((measure) => measure.events.forEach((event) => ids.set(event, `m3n-e-${++id}`))))
    const tracks = parts.flatMap(([, part]) => [part.melody, part.bass]
      .map((measures) => measures.filter((measure) => measure.events.length > 0 || measure.multiRest !== undefined))
      .filter((measures) => measures.length > 0))
    const layout = tracks.flatMap((measures) => buildNumberedLayout(measures, { width, padding: 28, fontSize, beatLength: 4 / Math.max(1, document.meterUnit), lyricWidth: (event) => eventLabelWidth(event, lyrics, fontSize), labelWidth: (event) => eventLabelWidth(event, lyrics, fontSize), rowHeight: (row) => fontSize * (row.some((measure) => measure.events.some((event) => lyrics.has(event))) ? 4.5 : 3.2) }))
    const naturalHeight = layout.reduce((sum, system) => sum + system.height, 0) + 40
    const pageHeight = options.paged ? options.pageHeight ?? 1100 : Math.max(160, naturalHeight)
    const pages: SVGSVGElement[] = []
    let page = node('svg', { xmlns: SVG_NS, viewBox: `0 0 ${width} ${pageHeight}`, width, height: pageHeight, class: 'numbered-score' })
    style(page, fontSize)
    let cursor = 20
    layout.forEach((system, index) => {
      if (options.paged && cursor + system.height > pageHeight - 30 && index > 0) {
        pages.push(page)
        page = node('svg', { xmlns: SVG_NS, viewBox: `0 0 ${width} ${pageHeight}`, width, height: pageHeight, class: 'numbered-score' })
        style(page, fontSize)
        cursor = 20
      }
      const group = node('g', { class: 'numbered-system', transform: `translate(0 ${cursor + fontSize * 1.25})` })
      system.measures.forEach((measure) => drawMeasure(group, measure, document, lyrics, ids, fontSize))
      page.append(group)
      cursor += system.height
    })
    pages.push(page)
    const firstPage = pages[0]
    if (firstPage) addScoreHeaderToSvg(firstPage, options.headerMetadata, width, pageHeight)
    return new NumberedScore(pages)
  }

  attach(target: HTMLElement) { this.pages.forEach((page) => target.append(page.cloneNode(true))) }
  pagesClone() { return this.pages.map((page) => page.cloneNode(true) as SVGSVGElement) }
  destroy() {}
}
