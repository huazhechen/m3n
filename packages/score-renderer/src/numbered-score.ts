import type { ScoreDocument, ScoreEvent, ScoreHeaderMetadata, ScoreLyricBlock, ScoreMeasure } from '@m3n/notation'
import { m3nPitch } from '@m3n/notation'
import fanqieGlyphs from './assets/open-fanqie-glyphs.json'
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

type LyricCell = { row: number; text: string }
type LyricMap = Map<ScoreEvent, LyricCell[]>

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number | undefined> = {}) {
  const element = document.createElementNS(SVG_NS, tag)
  Object.entries(attrs).forEach(([key, value]) => { if (value !== undefined) element.setAttribute(key, String(value)) })
  return element
}

function text(value: string, attrs: Record<string, string | number | undefined> = {}) {
  const element = svg('text', attrs)
  element.textContent = value
  return element
}

function glyph(parent: SVGElement, id: string, x: number, y: number, fontSize = 18, className?: string) {
  const page = parent.ownerSVGElement ?? parent.closest<SVGSVGElement>('svg')
  const defs = page?.querySelector<SVGDefsElement>('defs.numbered-glyph-definitions')
  const glyphMap = fanqieGlyphs as Record<string, string>
  if (defs && !defs.querySelector(`:scope > [id="${id}"]`)) defs.insertAdjacentHTML('beforeend', glyphMap[id] ?? '')
  const wrapper = svg('g', { transform: `translate(${x} ${y}) scale(${fontSize / 18})`, class: className ?? 'numbered-glyph' })
  wrapper.append(svg('use', { href: `#${id}` }))
  parent.append(wrapper)
  return wrapper
}

function pitch(token: string) {
  const match = /^(?:([1-7])([#b=]*)([ed]*)|0)/.exec(token)
  if (!match || match[0] === '0') return { degree: '0', accidental: '', octave: 0 }
  return {
    degree: match[1] ?? '0',
    accidental: match[2] ?? '',
    octave: [...(match[3] ?? '')].reduce((total, mark) => total + (mark === 'e' ? 1 : -1), 0),
  }
}

function lyricRowByBlock(blocks: readonly ScoreLyricBlock[]) {
  const rows = new Map<ScoreLyricBlock, number>()
  const groups = new Map<string, ScoreLyricBlock[]>()
  blocks.forEach((block) => {
    const key = `${block.targetStart ?? -1}:${block.targetEnd ?? -1}`
    groups.set(key, [...(groups.get(key) ?? []), block])
  })
  groups.forEach((items) => items.forEach((block, row) => rows.set(block, row)))
  return rows
}

function lyricsForDocument(document: ScoreDocument): LyricMap {
  const melody = [...document.parts.values()].flatMap((part) => part.melody.flatMap((measure) => measure.events))
    .filter((event) => event.kind === 'note' || event.kind === 'chord' || event.kind === 'tuplet')
  const rows = lyricRowByBlock(document.lyrics)
  const map: LyricMap = new Map()
  document.lyrics.forEach((block) => {
    const targets = melody.filter((event) => block.targetStart === undefined || block.targetEnd === undefined || (event.sourceStart >= block.targetStart && event.sourceEnd <= block.targetEnd))
    let targetIndex = 0
    block.syllables.forEach((syllable) => {
      while (targets[targetIndex]?.tie && !syllable.forceTiedTarget) targetIndex += 1
      const target = targets[targetIndex]
      targetIndex += 1
      if (!target || syllable.kind !== 'text' || !syllable.text) return
      map.set(target, [...(map.get(target) ?? []), { row: rows.get(block) ?? 0, text: syllable.text }])
    })
  })
  return map
}

function textCells(value: string) {
  return [...value].reduce((total, character) => total + ((character.codePointAt(0) ?? 0x80) <= 0x7f ? 0.5 : 1), 0)
}

function lyricOverflow(event: ScoreEvent, lyrics: LyricMap, fontSize: number) {
  const cells = Math.max(0, ...((lyrics.get(event) ?? []).map((item) => textCells(item.text))))
  if (cells <= 1) return 0
  // Exact Open Fanqie ratio: 250 / 9 at the default 18px score glyph size.
  return Math.max(0, cells * (250 / 9) * (fontSize / 18) - 25 * (fontSize / 18))
}

function durationDots(event: ScoreEvent) {
  if ((event.kind !== 'note' && event.kind !== 'rest') || event.beats <= 0) return 0
  const base = Math.pow(2, Math.floor(Math.log2(event.beats)))
  const ratio = event.beats / base
  if (ratio >= 1.875 - 1e-4) return 3
  if (ratio >= 1.75 - 1e-4) return 2
  return ratio >= 1.5 - 1e-4 ? 1 : 0
}

function glyphStyle(page: SVGSVGElement, fontSize: number) {
  const defs = svg('defs', { class: 'numbered-glyph-definitions' })
  // Event groups are built before they are attached to their page, so they do
  // not yet have an owner SVG from which to lazily register a definition.
  // Preloading the compact Open Fanqie glyph table makes every <use> stable.
  defs.insertAdjacentHTML('beforeend', Object.values(fanqieGlyphs).join(''))
  page.append(defs)
  const style = svg('style')
  style.textContent = `.numbered-score{background:#fff}.numbered-event{cursor:pointer}.numbered-hit{fill:transparent}.numbered-number{font:${fontSize * 1.42}px 'Times New Roman','Noto Serif CJK SC',serif;font-weight:600;fill:#101010;text-anchor:middle}.numbered-accidental{font:${fontSize * 0.82}px 'Times New Roman',serif;fill:#101010;text-anchor:end}.numbered-lyric{font:${fontSize}px 'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',sans-serif;fill:#101010;text-anchor:start}.numbered-label,.numbered-navigation,.numbered-ending-label{font:${fontSize * 0.72}px 'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',sans-serif;fill:#303030;text-anchor:middle}.numbered-title{font:${fontSize * 2}px 'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',sans-serif;font-weight:700;fill:#101010;text-anchor:middle}.numbered-subtitle{font:${fontSize * 1.1}px 'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',sans-serif;fill:#101010;text-anchor:middle}.numbered-header-meta{font:${fontSize * 0.9}px 'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',sans-serif;fill:#202020}.numbered-header-mode{font:${fontSize * 1.16}px 'Times New Roman','Noto Serif CJK SC',serif;fill:#101010}.numbered-header-meter{font:${fontSize * 1.05}px 'Times New Roman',serif;fill:#101010;text-anchor:middle}.numbered-bar{stroke:#101010;stroke-width:1.25}.numbered-bar-heavy{stroke:#101010;stroke-width:2.8}.numbered-beam{stroke:#101010;stroke-width:1.65;stroke-linecap:butt}.numbered-octave{fill:#101010}.numbered-ending,.numbered-tie{fill:none;stroke:#101010;stroke-width:1.1}.numbered-navigation-symbol{fill:none;stroke:#101010;stroke-width:1.1}.is-source-active .numbered-lyric,.numbered-lyric.is-playing{fill:#17699c}.measure-cursor-highlight,.measure-playback-highlight{fill:#dceeff;opacity:.52}`
  page.prepend(style)
}

function drawPitch(group: SVGGElement, token: string, x: number, y: number, key: string, fontSize: number, beamLines: number, offset = 0) {
  const parsed = pitch(token)
  const resolved = parsed.degree === '0' ? undefined : m3nPitch(token, key)
  const accidental = parsed.accidental || (resolved?.accid === 's' ? '#' : resolved?.accid === 'f' ? 'b' : resolved?.accid === 'n' ? '=' : '')
  const pitchY = y + offset
  const accidentalId = accidental === '#' ? 'bianyinfu_sheng' : accidental === 'b' ? 'bianyinfu_jiang' : accidental === '=' ? 'bianyinfu_huanyuan' : undefined
  if (accidentalId) glyph(group, accidentalId, x, pitchY, fontSize, 'numbered-glyph numbered-accidental-glyph')
  else if (accidental) group.append(text(accidental, { x: x - fontSize * 0.55, y: pitchY + fontSize * 0.18, class: 'numbered-accidental' }))
  glyph(group, parsed.degree === '0' ? 'shuzi_b_0' : `shuzi_b_${parsed.degree}`, x, pitchY, fontSize, 'numbered-glyph numbered-number').setAttribute('data-numbered-x', String(x))
  for (let index = 0; index < Math.abs(parsed.octave); index += 1) {
    const octaveY = parsed.octave > 0
      // Fanqie's octave glyphs carry their first dot offset internally.
      // Only additional octave marks need another glyph-height shift.
      ? pitchY - index * fontSize * 0.33
      : pitchY + fontSize * (0.055 + beamLines * 0.22 + index * 0.33)
    glyph(group, parsed.octave > 0 ? 'yingao_gao' : 'yingao_di', x + (parsed.degree === '4' ? fontSize * 0.14 : 0), octaveY, fontSize, 'numbered-glyph numbered-octave')
  }
}

function drawBarline(parent: SVGGElement, type: string | undefined, x: number, fontSize: number) {
  if (!type) return
  const glyphId = type === 'single' ? 'xiaojiexian'
    : type === 'dbl' ? 'xiaojiexian_shuangxian'
      : type === 'end' ? 'jieshufu'
        : type === 'rptstart' ? 'xunhuan_zuo'
          : type === 'rptend' ? 'xunhuan_you'
            : undefined
  if (glyphId) {
    const marker = glyph(parent, glyphId, x, 0, fontSize, `numbered-glyph numbered-bar-${type}`)
    marker.setAttribute('data-bar-x', String(x))
    if (type === 'end' || type === 'rptstart' || type === 'rptend') marker.classList.add('numbered-bar-heavy')
  }
}

function drawBeams(parent: SVGGElement, placements: readonly NumberedEventPlacement[], fontSize: number) {
  const grouped = new Map<number, NumberedEventPlacement[]>()
  placements.forEach((placement) => grouped.set(placement.beat, [...(grouped.get(placement.beat) ?? []), placement]))
  grouped.forEach((items) => {
    const maximum = Math.max(0, ...items.map((item) => item.durationLines))
    for (let level = 1; level <= maximum; level += 1) {
      let run: NumberedEventPlacement[] = []
      const flush = () => {
        const first = run[0]
        const last = run.at(-1)
        if (first && last) parent.append(svg('line', { x1: first.center - fontSize * 0.36, x2: last.center + fontSize * 0.36, y1: fontSize * (0.68 + (level - 1) * 0.17), y2: fontSize * (0.68 + (level - 1) * 0.17), class: 'numbered-beam', 'data-duration-level': level }))
        run = []
      }
      items.forEach((item) => {
        if (item.durationLines >= level) run.push(item)
        else flush()
      })
      flush()
    }
  })
}

function drawEvent(parent: SVGGElement, placement: NumberedEventPlacement, lyrics: LyricMap, id: string, fontSize: number) {
  const event = placement.event
  const group = svg('g', { class: 'numbered-event', id, 'data-m3n-id': id, 'data-source-start': event.sourceStart, 'data-source-end': event.sourceEnd })
  group.append(svg('rect', { x: placement.center - placement.width / 2, y: -fontSize * 1.45, width: placement.width, height: fontSize * 3.1, class: 'numbered-hit' }))
  const beamLines = placement.durationLines
  if (event.kind === 'rest' || event.pitches.length === 0) drawPitch(group, '0', placement.center, 0, event.key, fontSize, beamLines)
  else if (event.pitches.length === 1) drawPitch(group, event.pitches[0] ?? '0', placement.center, 0, event.key, fontSize, beamLines)
  else event.pitches.forEach((item, index) => drawPitch(group, item, placement.center, (index - (event.pitches.length - 1) / 2) * fontSize * 0.54, event.key, fontSize * 0.8, beamLines))
  for (let index = 0; index < durationDots(event); index += 1) glyph(group, index === 0 ? 'fudian' : 'fudian2', placement.center + index * fontSize * 0.45, 0, fontSize, 'numbered-glyph numbered-duration-dot')
  if (event.beats >= 2 && event.kind !== 'rest') {
    const marks = Math.max(1, Math.floor(event.beats) - 1)
    for (let index = 0; index < marks; index += 1) group.append(text('-', { x: placement.center + fontSize * (0.78 + index * 0.48), y: fontSize * 0.05, class: 'numbered-number' }))
  }
  if (event.chord) group.append(text(event.chord, { x: placement.center, y: -fontSize * 1.55, class: 'numbered-label' }))
  if (event.dynamic || event.text) group.append(text(event.dynamic ?? event.text ?? '', { x: placement.center, y: -fontSize * 2.12, class: 'numbered-label' }))
  parent.append(group)
  return lyrics.get(event) ?? []
}

function systemLyricRows(system: NumberedSystem, lyrics: LyricMap) {
  const rows = new Set<number>()
  system.measures.forEach((measure) => measure.placements.forEach((placement) => (lyrics.get(placement.event) ?? []).forEach((cell) => rows.add(cell.row))))
  return rows.size
}

function systemTopClearance(fontSize: number, measures: readonly ScoreMeasure[] = []) {
  return fontSize * (measures.some((measure) => measure.ending || measure.navigation?.length) ? 2.85 : 2.1)
}

function rowAdvance(measures: readonly ScoreMeasure[], lyrics: LyricMap, fontSize: number) {
  const events = measures.flatMap((measure) => measure.events)
  const lyricRows = Math.max(0, ...events.map((event) => Math.max(0, ...(lyrics.get(event) ?? []).map((cell) => cell.row + 1))))
  const scale = fontSize / 18
  const lyricBottom = lyricRows ? fontSize * (2.12 + (lyricRows - 1) * (28 / 18) + 0.3) : fontSize * 1.1
  return systemTopClearance(fontSize, measures) + lyricBottom + 20 * scale
}

function drawEndings(parent: SVGGElement, system: NumberedSystem, fontSize: number) {
  let start = 0
  while (start < system.measures.length) {
    const first = system.measures[start]
    const ending = first?.measure.ending
    if (!first || !ending) { start += 1; continue }
    let end = start
    while (system.measures[end + 1]?.measure.ending === ending) end += 1
    const last = system.measures[end] ?? first
    const top = -fontSize * 2.45
    const left = first.x + fontSize * 0.1
    const right = last.barX
    parent.append(svg('path', { d: `M ${left} ${top + fontSize * 0.7} V ${top} H ${right} V ${top + fontSize * 0.38}`, class: 'numbered-ending' }))
    parent.append(text(`${ending}.`, { x: left + fontSize * 0.34, y: top + fontSize * 0.48, class: 'numbered-ending-label', 'text-anchor': 'start' }))
    start = end + 1
  }
}

function drawTies(parent: SVGGElement, system: NumberedSystem, fontSize: number) {
  const placements = system.measures.flatMap((measure) => measure.placements)
  placements.forEach((current, index) => {
    if (!current.event.tie) return
    const next = placements[index + 1]
    if (!next) return
    const left = current.center + fontSize * 0.35
    const right = next.center - fontSize * 0.35
    if (right <= left) return
    const baseline = -fontSize * 1.05
    const control = Math.max(fontSize * 0.35, (right - left) * 0.28)
    parent.append(svg('path', { d: `M ${left} ${baseline} C ${left + control} ${baseline - fontSize * 0.62}, ${right - control} ${baseline - fontSize * 0.62}, ${right} ${baseline}`, class: 'numbered-tie' }))
  })
}

function drawNavigation(parent: SVGGElement, measure: ScoreMeasure, x: number, fontSize: number) {
  const navigation = measure.navigation ?? []
  const y = -fontSize * 1.83
  navigation.forEach((item, index) => {
    const itemX = x + index * fontSize * 1.5
    if (item === 'segno') {
      parent.append(svg('circle', { cx: itemX + fontSize * 0.35, cy: y - fontSize * 0.22, r: fontSize * 0.28, class: 'numbered-navigation-symbol' }))
      parent.append(svg('line', { x1: itemX + fontSize * 0.02, x2: itemX + fontSize * 0.67, y1: y + fontSize * 0.2, y2: y - fontSize * 0.63, class: 'numbered-navigation-symbol' }))
      parent.append(svg('circle', { cx: itemX + fontSize * 0.08, cy: y - fontSize * 0.62, r: fontSize * 0.07, fill: '#101010' }))
      parent.append(svg('circle', { cx: itemX + fontSize * 0.62, cy: y + fontSize * 0.17, r: fontSize * 0.07, fill: '#101010' }))
    } else parent.append(text(item === 'ds' ? 'D.S.' : item === 'dc' ? 'D.C.' : 'Fine', { x: itemX, y, class: 'numbered-navigation', 'text-anchor': 'start' }))
  })
  if (measure.repeatCount && measure.repeatCount !== 2) parent.append(text(`x${measure.repeatCount}`, { x: x - fontSize * 0.5, y, class: 'numbered-navigation', 'text-anchor': 'end' }))
}

function drawSystem(page: SVGGElement, system: NumberedSystem, lyrics: LyricMap, ids: Map<ScoreEvent, string>, fontSize: number) {
  const group = svg('g', { class: 'numbered-system' })
  const rows = systemLyricRows(system, lyrics)
  const lyricsByRow = new Map<number, Array<{ x: number; text: string }>>()
  system.measures.forEach((measure) => {
    const measureGroup = svg('g', { class: 'measure', 'data-measure-index': measure.index })
    measure.placements.forEach((placement) => {
      const cells = drawEvent(measureGroup, placement, lyrics, ids.get(placement.event) ?? `m3n-e-${measure.index + 1}-${placement.eventIndex + 1}`, fontSize)
      cells.forEach((cell) => lyricsByRow.set(cell.row, [...(lyricsByRow.get(cell.row) ?? []), { x: placement.center, text: cell.text }]))
    })
    drawBeams(measureGroup, measure.placements, fontSize)
    drawBarline(measureGroup, measure.measure.left, measure.x, fontSize)
    drawBarline(measureGroup, measure.measure.right, measure.barX, fontSize)
    drawNavigation(measureGroup, measure.measure, measure.x, fontSize)
    group.append(measureGroup)
  })
  drawEndings(group, system, fontSize)
  drawTies(group, system, fontSize)
  const lyricBase = fontSize * 2.12
  lyricsByRow.forEach((cells, row) => cells.forEach((cell) => group.append(text(cell.text, { x: cell.x - fontSize / 2, y: lyricBase + row * fontSize * (28 / 18), class: 'numbered-lyric', 'data-lyric-row': row }))))
  if (rows > 0) group.setAttribute('data-lyric-rows', String(rows))
  page.append(group)
}

function drawNumberedHeader(page: SVGSVGElement, document: ScoreDocument, metadata: readonly ScoreHeaderMetadata[], width: number, margin: number, fontSize: number) {
  const scale = fontSize / 18
  const title = document.title || metadata.find((item) => item.side === 'center' && item.priority === 0)?.value || ''
  const subtitle = document.subtitle || metadata.find((item) => item.side === 'center' && item.priority > 0)?.value || ''
  const titleY = margin + 30 * scale
  const infoY = title ? margin + 80 * scale : margin + 28 * scale
  if (title) page.append(text(title, { x: width / 2, y: titleY, class: 'numbered-title' }))
  if (subtitle) page.append(text(subtitle, { x: width / 2, y: titleY + fontSize * 1.55, class: 'numbered-subtitle' }))
  const authorLines = [
    document.lyricist ? `${document.lyricist} 词` : '',
    document.composer ? `${document.composer} 曲` : '',
    document.arranger ? `${document.arranger} 编曲` : '',
    document.singer ? `${document.singer} 演唱` : '',
  ].filter(Boolean)
  if (authorLines.length === 0) {
    const fallback = metadata.find((item) => item.side === 'right')?.value
    if (fallback) authorLines.push(fallback)
  }
  authorLines.forEach((line, index) => page.append(text(line, { x: width - margin, y: infoY + fontSize * (index * 1.05), class: 'numbered-header-meta', 'text-anchor': 'end' })))

  const key = /^([A-G])([#b]?)/.exec(document.key)
  const keyLetter = key?.[1]?.toLowerCase() ?? 'c'
  const keyAccidental = key?.[2]
  page.setAttribute('data-numbered-key', document.key)
  let x = margin
  glyph(page, 'diaohao_fu', x, infoY, fontSize)
  x += fontSize * 0.88
  if (keyAccidental) {
    glyph(page, keyAccidental === '#' ? 'bianyinfu_sheng' : 'bianyinfu_jiang', x, infoY, fontSize)
    x += fontSize * 0.32
  }
  glyph(page, `diaohao_zimu_${keyLetter}`, x, infoY, fontSize)
  x += fontSize * 0.95
  glyph(page, 'paihao_xian', x, infoY, fontSize)
  x += fontSize * 0.55
  glyph(page, `shuzi_b_bian_${String(document.meterCount).slice(-1)}`, x, infoY - fontSize * 0.67, fontSize)
  glyph(page, `shuzi_b_bian_${String(document.meterUnit).slice(-1)}`, x, infoY + fontSize * 0.67, fontSize)
  const tempoY = infoY + fontSize * 2.04
  glyph(page, 'jiepaifu', margin, tempoY, fontSize)
  page.append(text(`= ${document.tempo}`, { x: margin + fontSize * 1.38, y: tempoY + fontSize * 0.12, class: 'numbered-header-meta', 'data-numbered-tempo': document.tempo }))
  return infoY + fontSize * 3.4
}

export class NumberedScore {
  private constructor(private readonly pages: SVGSVGElement[]) {}

  static create(document: ScoreDocument, options: NumberedScoreOptions) {
    const width = Math.max(320, options.width)
    // Open Fanqie's default page is 1000 logical units wide with 18px lyrics.
    // Scale only the type for responsive preview; the layout grid follows it.
    const fontSize = options.fontSize ?? (options.compact ? 15 : Math.max(15, 18 * (width / 1000)))
    const lyrics = lyricsForDocument(document)
    const ids = new Map<ScoreEvent, string>()
    let eventId = 0
    const parts = [...document.parts.values()]
    parts.forEach((part) => [...part.melody, ...part.bass].forEach((measure) => measure.events.forEach((event) => ids.set(event, `m3n-e-${++eventId}`))))
    const tracks = parts.flatMap((part) => [part.melody, part.bass].map((measures) => measures.filter((measure) => measure.events.length > 0 || measure.multiRest !== undefined)).filter((measures) => measures.length > 0))
    // Paged previews already reserve the same 10 mm physical sheet inset as
    // the Verovio renderer.  Keep only a small internal notation gutter so
    // numbered notation reaches the identical content width.
    const pageMargin = Math.max(12, width * 0.025)
    const systems = tracks.flatMap((measures) => buildNumberedLayout(measures, { width, padding: pageMargin, fontSize, beatLength: 1, lyricOverflow: (event) => lyricOverflow(event, lyrics, fontSize), rowHeight: (row) => rowAdvance(row, lyrics, fontSize) }))
    const headerHeight = pageMargin + fontSize * 8
    const contentHeight = systems.reduce((sum, system) => sum + system.height, 0) + headerHeight + pageMargin
    const pageHeight = options.paged ? options.pageHeight ?? 1100 : Math.max(180, contentHeight)
    const pages: SVGSVGElement[] = []
    let page = svg('svg', { xmlns: SVG_NS, viewBox: `0 0 ${width} ${pageHeight}`, width, height: pageHeight, class: 'numbered-score' })
    glyphStyle(page, fontSize)
    let cursor = drawNumberedHeader(page, document, options.headerMetadata, width, pageMargin, fontSize)
    systems.forEach((system, index) => {
      if (options.paged && cursor + system.height > pageHeight - 34 && index > 0) {
        pages.push(page)
        page = svg('svg', { xmlns: SVG_NS, viewBox: `0 0 ${width} ${pageHeight}`, width, height: pageHeight, class: 'numbered-score' })
        glyphStyle(page, fontSize)
        cursor = pageMargin
      }
      const holder = svg('g', { transform: `translate(0 ${cursor + systemTopClearance(fontSize, system.measures.map((measure) => measure.measure))})` })
      drawSystem(holder, system, lyrics, ids, fontSize)
      page.append(holder)
      cursor += system.height
    })
    pages.push(page)
    return new NumberedScore(pages)
  }

  attach(target: HTMLElement) { this.pages.forEach((page) => target.append(page.cloneNode(true))) }
  pagesClone() { return this.pages.map((page) => page.cloneNode(true) as SVGSVGElement) }
  destroy() {}
}
