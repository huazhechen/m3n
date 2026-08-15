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
type MeasureSettings = { key?: string; meter?: { count: number; unit: number }; tempo?: number }

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
  style.textContent += '.numbered-tuplet{fill:none;stroke:#101010;stroke-width:1.1}'
  page.prepend(style)
}

function drawPitch(group: SVGGElement, token: string, x: number, y: number, key: string, fontSize: number, beamLines: number, offset = 0, compact = false) {
  const parsed = pitch(token)
  const resolved = parsed.degree === '0' ? undefined : m3nPitch(token, key)
  const accidental = parsed.accidental || (resolved?.accid === 's' ? '#' : resolved?.accid === 'f' ? 'b' : resolved?.accid === 'n' ? '=' : '')
  const pitchY = y + offset
  const accidentalId = accidental === '#' ? 'bianyinfu_sheng' : accidental === 'b' ? 'bianyinfu_jiang' : accidental === '=' ? 'bianyinfu_huanyuan' : undefined
  if (accidentalId) glyph(group, accidentalId, x, pitchY, fontSize, 'numbered-glyph numbered-accidental-glyph')
  else if (accidental) group.append(text(accidental, { x: x - fontSize * 0.55, y: pitchY + fontSize * 0.18, class: 'numbered-accidental' }))
  const digitId = parsed.degree === '0' ? 'shuzi_b_0' : compact ? `shuzi_b_bian_${parsed.degree}` : `shuzi_b_${parsed.degree}`
  glyph(group, digitId, x, pitchY, fontSize, `numbered-glyph numbered-number${compact ? ' numbered-tuplet-number' : ''}`).setAttribute('data-numbered-x', String(x))
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
            : type === 'rptboth' ? 'xunhuan_zuoyou'
            : undefined
  if (glyphId) {
    const marker = glyph(parent, glyphId, x, 0, fontSize, `numbered-glyph numbered-bar-${type}`)
    if (type === 'rptstart' || type === 'rptend' || type === 'rptboth') {
      // The source glyph is drawn for a 1000-unit page.  At the responsive
      // preview scale its 2.4-unit heavy rule becomes an opaque block; retain
      // the original paths but optically condense just repeat boundaries.
      const scale = fontSize / 18
      marker.setAttribute('transform', `translate(${x} 0) scale(${scale * 0.78} ${scale})`)
    }
    marker.setAttribute('data-bar-x', String(x))
    if (type === 'end' || type === 'rptstart' || type === 'rptend' || type === 'rptboth') marker.classList.add('numbered-bar-heavy')
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
  else if (event.kind === 'tuplet') {
    const step = fontSize * (25 / 18)
    const left = placement.center - (event.pitches.length - 1) * step / 2
    event.pitches.forEach((item, index) => drawPitch(group, item, left + index * step, 0, event.key, fontSize, beamLines, 0, true))
    const arcLeft = left - fontSize * 0.42
    const arcRight = left + (event.pitches.length - 1) * step + fontSize * 0.42
    const top = -fontSize * 1.13
    group.append(svg('path', { d: `M ${arcLeft} ${top + fontSize * 0.4} C ${arcLeft + (arcRight - arcLeft) * 0.24} ${top - fontSize * 0.28}, ${arcRight - (arcRight - arcLeft) * 0.24} ${top - fontSize * 0.28}, ${arcRight} ${top + fontSize * 0.4}`, class: 'numbered-tuplet' }))
    const tupletNumber = String(event.tuplet?.num ?? event.pitches.length)
    if (/^[2-9]$/.test(tupletNumber)) glyph(group, `lianyin_shuzi_${tupletNumber}`, placement.center, top - fontSize * 0.12, fontSize, 'numbered-glyph numbered-tuplet-label')
  } else event.pitches.forEach((item, index) => drawPitch(group, item, placement.center, (index - (event.pitches.length - 1) / 2) * fontSize * 0.54, event.key, fontSize * 0.8, beamLines))
  for (let index = 0; index < durationDots(event); index += 1) glyph(group, index === 0 ? 'fudian' : 'fudian2', placement.center + index * fontSize * 0.45, 0, fontSize, 'numbered-glyph numbered-duration-dot')
  placement.extensionXs.forEach((x, index) => {
    const sustain = glyph(group, 'yanyinfu', x, 0, fontSize, 'numbered-glyph numbered-sustain')
    sustain.setAttribute('data-numbered-sustain-x', String(x))
    sustain.setAttribute('data-numbered-sustain-index', String(index))
  })
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
    const left = first.leftBarX
    const right = last.barX
    // Match the bracket legs to the Open Fanqie barline height so alternate
    // endings read as structural measure boundaries instead of short labels.
    const barHeight = fontSize * (29 / 18)
    parent.append(svg('path', { d: `M ${left} ${top + barHeight} V ${top} H ${right} V ${top + barHeight * 0.84}`, class: 'numbered-ending' }))
    if (/^\d$/.test(ending)) glyph(parent, `shuzi_b_bian_${ending}`, left + fontSize * 0.48, top + fontSize * 0.58, fontSize * 0.72, 'numbered-glyph numbered-ending-label')
    else parent.append(text(ending, { x: left + fontSize * 0.34, y: top + fontSize * 0.48, class: 'numbered-ending-label', 'text-anchor': 'start' }))
    start = end + 1
  }
}

function drawTies(parent: SVGGElement, system: NumberedSystem, fontSize: number) {
  const placements = system.measures.flatMap((measure) => measure.placements)
  placements.forEach((current, index) => {
    if (!current.event.tie) return
    const next = placements[index + 1]
    if (!next) return
    const left = current.center + fontSize * (1 / 18)
    const right = next.center - fontSize * (1 / 18)
    if (right <= left) return
    const hasHighOctave = [current.event, next.event].some((event) => event.pitches.some((token) => pitch(token).octave > 0))
    const baseline = -fontSize * ((16 + (hasHighOctave ? 5 : 0)) / 18)
    const control = Math.max(fontSize * (0.4 / 18), (right - left) * 0.3 - fontSize * (0.4 / 18))
    parent.append(svg('path', { d: `M ${left} ${baseline} C ${left + control} ${baseline - fontSize * (10 / 18)}, ${right - control} ${baseline - fontSize * (10 / 18)}, ${right} ${baseline}`, class: 'numbered-tie' }))
  })
}

function drawNavigation(parent: SVGGElement, measure: ScoreMeasure, startX: number, barX: number, fontSize: number) {
  const navigation = measure.navigation ?? []
  const y = -fontSize * 1.83
  navigation.forEach((item, index) => {
    const itemX = startX + index * fontSize * 1.5
    if (item === 'segno') {
      parent.append(svg('circle', { cx: itemX + fontSize * 0.35, cy: y - fontSize * 0.22, r: fontSize * 0.28, class: 'numbered-navigation-symbol' }))
      parent.append(svg('line', { x1: itemX + fontSize * 0.02, x2: itemX + fontSize * 0.67, y1: y + fontSize * 0.2, y2: y - fontSize * 0.63, class: 'numbered-navigation-symbol' }))
      parent.append(svg('circle', { cx: itemX + fontSize * 0.08, cy: y - fontSize * 0.62, r: fontSize * 0.07, fill: '#101010' }))
      parent.append(svg('circle', { cx: itemX + fontSize * 0.62, cy: y + fontSize * 0.17, r: fontSize * 0.07, fill: '#101010' }))
    } else {
      const glyphId = item === 'fine' ? 'xiaojiexian_fine' : item === 'ds' ? 'xiaojiexian_ds' : 'xiaojiexian_dc'
      // Open Fanqie places barline ornaments 26 logical units above the
      // music baseline. Their visual centre must sit to the barline's left:
      // anchoring it at barX overlays the D.S./D.C. letters on the rule.
      const ornamentX = barX - fontSize * ((15 + index * 22) / 18)
      const ornament = glyph(parent, glyphId, ornamentX, -fontSize * (26 / 18), fontSize, 'numbered-glyph numbered-navigation')
      ornament.setAttribute('data-numbered-navigation-x', String(ornamentX))
    }
  })
  if (measure.repeatCount && measure.repeatCount !== 2) {
    const count = String(measure.repeatCount)
    if (/^\d$/.test(count)) glyph(parent, `shuzi_b_bian_${count}`, barX - fontSize * 0.55, y, fontSize * 0.72, 'numbered-glyph numbered-navigation')
    else parent.append(text(`x${count}`, { x: barX - fontSize * 0.5, y, class: 'numbered-navigation', 'text-anchor': 'end' }))
  }
}

function measureSettingsWidth(settings: MeasureSettings | undefined, fontSize: number) {
  if (!settings) return 0
  const scale = fontSize / 18
  return (settings.key ? 55 : 0) * scale + (settings.meter ? 45 : 0) * scale
}

function drawMeasureSettings(parent: SVGGElement, settings: MeasureSettings | undefined, x: number, fontSize: number) {
  if (!settings) return
  const scale = fontSize / 18
  let cursor = x
  if (settings.key) {
    const key = /^([A-G])([#b]?)/.exec(settings.key)
    const accidental = key?.[2]
    glyph(parent, 'diaohao_fu', cursor, 0, fontSize)
    const modeX = cursor + (accidental ? 45 : 40) * scale
    if (accidental) glyph(parent, accidental === '#' ? 'bianyinfu_sheng' : 'bianyinfu_jiang', modeX, 0, fontSize)
    glyph(parent, `diaohao_zimu_${key?.[1]?.toLowerCase() ?? 'c'}`, modeX, 0, fontSize)
    cursor += (accidental ? 55 : 50) * scale
  }
  if (settings.meter) {
    glyph(parent, 'linshi_paihao_fenxian', cursor, 0, fontSize)
    glyph(parent, `linshi_paihao_shuzi_${settings.meter.count}`, cursor + 28 * scale, -12 * scale, fontSize)
    glyph(parent, `linshi_paihao_shuzi_${settings.meter.unit}`, cursor + 28 * scale, 12 * scale, fontSize)
    cursor += 45 * scale
  }
  if (settings.tempo) {
    glyph(parent, 'jiepaifu', x, -26 * scale, fontSize)
    parent.append(text(`= ${settings.tempo}`, { x: x + 32 * scale, y: -20 * scale, class: 'numbered-label' }))
  }
}

function drawSystem(page: SVGGElement, system: NumberedSystem, lyrics: LyricMap, ids: Map<ScoreEvent, string>, settingsByMeasure: ReadonlyMap<ScoreMeasure, MeasureSettings>, fontSize: number) {
  const group = svg('g', { class: 'numbered-system' })
  const rows = systemLyricRows(system, lyrics)
  const lyricsByRow = new Map<number, Array<{ x: number; text: string }>>()
  system.measures.forEach((measure, measureIndex) => {
    const measureGroup = svg('g', { class: 'measure', 'data-measure-index': measure.index })
    drawMeasureSettings(measureGroup, settingsByMeasure.get(measure.measure), measure.x, fontSize)
    measure.placements.forEach((placement) => {
      const cells = drawEvent(measureGroup, placement, lyrics, ids.get(placement.event) ?? `m3n-e-${measure.index + 1}-${placement.eventIndex + 1}`, fontSize)
      cells.forEach((cell) => lyricsByRow.set(cell.row, [...(lyricsByRow.get(cell.row) ?? []), { x: placement.center, text: cell.text }]))
    })
    drawBeams(measureGroup, measure.placements, fontSize)
    if (measureIndex === 0 && measure.measure.left) drawBarline(measureGroup, measure.measure.left, measure.x, fontSize)
    drawBarline(measureGroup, measure.measure.right, measure.barX, fontSize)
    drawNavigation(measureGroup, measure.measure, measure.x, measure.barX, fontSize)
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
  const author = document.singer || document.composer || metadata.find((item) => item.side === 'right')?.value
  if (author) page.append(text(author, { x: width - margin, y: infoY, class: 'numbered-header-meta', 'text-anchor': 'end' }))

  const key = /^([A-G])([#b]?)/.exec(document.key)
  const keyLetter = key?.[1]?.toLowerCase() ?? 'c'
  const keyAccidental = key?.[2]
  page.setAttribute('data-numbered-key', document.key)
  let x = margin
  glyph(page, 'diaohao_fu', x, infoY, fontSize)
  const modeX = x + fontSize * (keyAccidental ? 45 / 18 : 40 / 18)
  if (keyAccidental) {
    glyph(page, keyAccidental === '#' ? 'bianyinfu_sheng' : 'bianyinfu_jiang', modeX, infoY, fontSize)
  }
  glyph(page, `diaohao_zimu_${keyLetter}`, modeX, infoY, fontSize)
  x += fontSize * (keyAccidental ? 55 / 18 : 50 / 18)
  glyph(page, 'paihao_xian', x, infoY, fontSize)
  const meterX = x + fontSize * (10 / 18)
  glyph(page, `shuzi_b_bian_${String(document.meterCount).slice(-1)}`, meterX, infoY - fontSize * (12 / 18), fontSize)
  glyph(page, `shuzi_b_bian_${String(document.meterUnit).slice(-1)}`, meterX, infoY + fontSize * (12 / 18), fontSize)
  const tempoY = infoY + fontSize * 2.04
  glyph(page, 'jiepaifu', margin, tempoY, fontSize)
  page.append(text(`= ${document.tempo}`, { x: margin + fontSize * (32 / 18), y: tempoY + fontSize * 0.12, class: 'numbered-header-meta', 'data-numbered-tempo': document.tempo }))
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
    const settingsByMeasure = new Map<ScoreMeasure, MeasureSettings>()
    tracks.forEach((measures) => {
      let key = document.key
      let meterCount = document.meterCount
      let meterUnit = document.meterUnit
      let tempo = document.tempo
      measures.forEach((measure, index) => {
        const first = measure.events[0]
        if (!first) return
        const settings: MeasureSettings = {}
        if (index > 0 && first.key !== key) settings.key = first.key
        if (index > 0 && (first.meterCount !== meterCount || first.meterUnit !== meterUnit)) settings.meter = { count: first.meterCount ?? meterCount, unit: first.meterUnit ?? meterUnit }
        if (index > 0 && first.tempo !== tempo) settings.tempo = first.tempo
        if (Object.keys(settings).length > 0) settingsByMeasure.set(measure, settings)
        key = first.key
        meterCount = first.meterCount ?? meterCount
        meterUnit = first.meterUnit ?? meterUnit
        tempo = first.tempo ?? tempo
      })
    })
    const systems = tracks.flatMap((measures) => buildNumberedLayout(measures, {
      width,
      padding: pageMargin,
      fontSize,
      beatLength: 1,
      lyricOverflow: (event) => lyricOverflow(event, lyrics, fontSize),
      leadingWidth: (measure) => measureSettingsWidth(settingsByMeasure.get(measure), fontSize),
      rowHeight: (row) => rowAdvance(row, lyrics, fontSize),
    }))
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
      drawSystem(holder, system, lyrics, ids, settingsByMeasure, fontSize)
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
