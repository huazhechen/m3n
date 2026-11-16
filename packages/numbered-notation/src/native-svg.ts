import { displayedTempo, scoreCreditLines } from '@m3n/notation'
import { nativeArcGeometry, nativeArcPath } from './native-arc.js'
import { nativeTupletGeometry } from './native-tuplet.js'
import { nativeBeamCount } from './native-note-metrics.js'
import { nativeHeaderGeometry } from './native-header.js'
import { nativeBarMetrics, nativeMeasureBars } from './native-horizontal.js'
import { NUMBER_FONT_CSS } from './font-data.js'
import { type NativeLayout, type NativeLane, type NativeRelation, type NativeSystem } from './native-layout.js'
import type { NativeGlyph, NativePitch, NativeMeasure } from './native-model.js'

const xml = (value: string | number) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
const n = (value: number) => Number(value.toFixed(4))
function attrs(values: Record<string, string | number | undefined>) { return Object.entries(values).filter(([, value]) => value !== undefined).map(([name, value]) => ` ${name}="${xml(typeof value === 'number' ? n(value) : value!)}"`).join('') }
const line = (x1: number, y1: number, x2: number, y2: number, width = 1.3, extra = '') => `<line${attrs({ x1, y1, x2, y2, stroke: '#000', 'stroke-width': width })}${extra}/>`
const circle = (x: number, y: number, radius = 1.6) => `<circle${attrs({ cx: x, cy: y, r: radius, fill: '#000' })}/>`
const path = (d: string, fill = 'none', extra = '') => `<path d="${d}" fill="${fill}" stroke="#000" stroke-width="1.2"${extra}/>`

class SvgPainter {
  private measurementSvg?: SVGSVGElement
  private readonly centerOffsets = new Map<string, number>()
  constructor(private readonly layout: NativeLayout) {}

  dispose() { this.measurementSvg?.remove() }

  text(text: string, x: number, y: number, size = 16, family = 'serif', extra: Record<string, string | number | undefined> = {}): string {
    const center = extra['text-anchor'] === 'middle'
    let offset = center ? this.layout.measurer.measureText(text, { fontFamily: family, fontSize: size, fontWeight: Number(extra['font-weight'] ?? 400), textAlign: 'center' }).centerOffset ?? 0 : 0
    if (center && typeof document !== 'undefined' && typeof SVGGraphicsElement !== 'undefined' && typeof SVGGraphicsElement.prototype.getBBox === 'function') {
      const key = JSON.stringify([text, size, family, extra['font-weight'] ?? 400])
      let cached = this.centerOffsets.get(key)
      if (cached === undefined) {
        this.measurementSvg ??= document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        this.measurementSvg.style.cssText = 'position:absolute;left:-20000px;visibility:hidden;pointer-events:none'
        if (!this.measurementSvg.isConnected) document.body.append(this.measurementSvg)
        const node = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        for (const [name, value] of Object.entries({ x: '0', y: '0', 'text-anchor': 'middle', 'font-family': family, 'font-size': String(size), 'font-weight': String(extra['font-weight'] ?? 400), 'xml:space': 'preserve' })) node.setAttribute(name, value)
        node.textContent = text; this.measurementSvg.append(node)
        const box = node.getBBox(); node.remove()
        cached = box.x + box.width / 2; this.centerOffsets.set(key, cached)
      }
      offset = cached
    }
    return `<text${attrs({ x: x - offset, y, 'font-size': size, 'font-family': family, fill: '#000', 'xml:space': 'preserve', ...extra })}>${xml(text)}</text>`
  }

  pitch(pitch: NativePitch, x: number, y: number, size = 22, beams = 0): string {
    let svg = this.text(pitch.degree, x, y, size, 'M3N Numbers', { 'text-anchor': 'middle' })
    if (pitch.accidental) svg += this.text(pitch.accidental, x - size * 0.44, y - size * 0.07, size * 0.68, 'serif', { 'text-anchor': 'end' })
    for (let index = 0; index < Math.abs(pitch.octave); index++) {
      const beamOffset = beams ? size * (0.92 + (beams - 1) * 0.14 + 0.055 - 0.84) : 0
      const offset = pitch.octave > 0 ? -size * (0.955 + index * 0.23) : size * (0.195 + index * 0.23) + beamOffset
      svg += circle(x, y + offset, size * 0.075)
    }
    return svg
  }

  tempo(text: string, x: number, y: number): string {
    const eighth = text.startsWith('♪'), value = text.replace(/^[♪♩]\s*/, '')
    let svg = `<ellipse${attrs({ cx: x + 4, cy: y - 4, rx: 4, ry: 2.6, fill: '#000' })}/>` + line(x + 7, y - 5, x + 7, y - 21, 1.2)
    if (eighth) svg += path(`M${n(x + 7)} ${n(y - 21)} q10 4 5 11 q2 -6 -5 -7`, '#000')
    return svg + this.text(value, x + 20, y, 16, 'M3N Numbers')
  }

  segno(x: number, y: number): string {
    const curve = path('M10 2 C0 -2 -1 7 7 9 C15 11 14 20 4 17 M1 18 L13 0') + circle(1.7, 6, 1) + circle(12.3, 12, 1)
    return `<g transform="translate(${n(x)} ${n(y - 15.8)})">${curve}</g>`
  }

  mark(mark: string, x: number, y: number): string {
    if (mark === 'tip' || mark === 'brk') return path(`M${n(x - 3.5)} ${n(y - 7)} L${n(x + 3.5)} ${n(y - 7)} L${n(x)} ${n(y)} Z`, '#000')
    if (mark === 'hold') return line(x - 4, y - 3, x + 4, y - 3, 1.5)
    if (mark === 'str') return path(`M${n(x - 4)} ${n(y - 7)} L${n(x + 4)} ${n(y - 3.5)} L${n(x - 4)} ${n(y)}`)
    if (mark === 'fermata') return path(`M${n(x - 7)} ${n(y - 1)} Q${n(x)} ${n(y - 15)} ${n(x + 7)} ${n(y - 1)}`) + circle(x, y - 3)
    if (mark === 'prall') return path(`M${n(x - 7)} ${n(y - 1)} l3 -6 l4 6 l4 -6 l3 6`)
    if (mark === 'breath') return this.text('’', x, y, 16, 'serif', { 'text-anchor': 'middle' })
    return this.text(/^f[1-5]$/.test(mark) ? mark.slice(1) : mark, x, y, /^f[1-5]$/.test(mark) ? 11 : 13, 'serif', { 'text-anchor': 'middle', 'font-style': /^(p{1,3}|f{1,3}|mp|mf|sfz)$/.test(mark) ? 'italic' : undefined })
  }

  glyph(glyph: NativeGlyph, system: NativeSystem, lane: NativeLane): string {
    let music = ''
    const role = glyph.sustain ? 'sustain' : undefined
    if (glyph.sustain) music += line(glyph.x - 4.62, glyph.y - 6.6, glyph.x + 4.62, glyph.y - 6.6, 2.2)
    else {
      const beamCount = Math.max(0, -Math.floor(Math.log2(glyph.writtenBeats)))
      glyph.pitches.forEach((pitch, index) => { music += this.pitch(pitch, glyph.x, glyph.y + (glyph.pitchOffsets?.[index] ?? -index * 29), 22, index === 0 ? beamCount : 0) })
      if (glyph.multiRest) music += this.text(String(glyph.multiRest), glyph.x, glyph.y - 26, 13, 'M3N Numbers', { 'text-anchor': 'middle' })
      const base = 2 ** Math.floor(Math.log2(glyph.writtenBeats)), ratio = glyph.writtenBeats / base
      const dots = [1, 1.5, 1.75, 1.875].findIndex(value => Math.abs(ratio - value) < 1e-7)
      for (let index = 0; index < dots; index++) music += circle(glyph.x + this.layout.measurer.measureText('0',{fontSize:22,fontFamily:'M3N Numbers'}).w / 2 + 4.29 + index * 5.94, glyph.y - 3.52, 1.65)
      const beams = Math.max(0, Math.round(-Math.log2(base)))
      for (let index = 0; index < beams; index++) music += line(glyph.x - 6, glyph.y + 3.245 + index * 3.08, glyph.x + 7, glyph.y + 3.245 + index * 3.08, 1.21)
    }
    if (glyph.graces.length) {
      const start = glyph.x - glyph.left + 3
      for (const [index, pitch] of glyph.graces.entries()) {
        music += this.pitch(pitch, start + index * 14, glyph.y - 15, 13)
        music += line(start + index * 14 - 4, glyph.y - 11, start + index * 14 + 4, glyph.y - 11, 1)
      }
      const last = start + (glyph.graces.length - 1) * 14
      music += path(`M${n(start)} ${n(glyph.y - 29)} Q${n((start + glyph.x) / 2)} ${n(glyph.y - 39)} ${n(glyph.x - 4)} ${n(glyph.y - 22)}`)
      if (glyph.graces.length > 1) music += line(start - 4, glyph.y - 11, last + 4, glyph.y - 11, 1)
    }
    let markY = glyph.y - 22 - Math.max(0, ...glyph.pitches.map(pitch => pitch.octave)) * 6 - (glyph.sustain ? 0 : (glyph.pitches.length - 1) * 29)
    const inner = glyph.marks.filter(mark => ['tip', 'brk', 'hold', 'str'].includes(mark))
    const outer = glyph.marks.filter(mark => !inner.includes(mark))
    for (const mark of [...inner, ...outer]) { music += this.mark(mark, glyph.x, markY); markY -= 15 }
    if (glyph.event?.postfixes.includes('arp') && glyph.pitches.length > 1 && !glyph.sustain) {
      const x = glyph.x - 13, top = glyph.y - (glyph.pitches.length - 1) * 29 - 20
      let d = `M${n(x)} ${n(top)}`
      for (let y = top; y < glyph.y - 4; y += 8) d += ` q-4 2 0 4 q4 2 0 4`
      music += path(d)
    }
    const group = `<g${attrs({ class: 'note', id: glyph.id, 'data-m3n-id': glyph.xmlId, 'data-m3n-role': role, 'data-m3n-system': system.index, 'data-m3n-measure': glyph.measureId, 'data-m3n-passes': glyph.passes?.join('-') })}>${music}</g>`
    const annotations: string[] = []
    glyph.annotations.forEach((annotation, index) => {
      const isSection = glyph.event?.sectionLabel === annotation && glyph.event.sectionLabelBreakAfter
      const textWidth = this.layout.measurer.measureText(annotation, { fontSize: 14 }).w
      const x = isSection ? system.measures[0]!.start + textWidth / 2 + 5 : Math.max(this.layout.margin + textWidth / 2, Math.min(glyph.x, this.layout.options.width - this.layout.margin - textWidth / 2))
      const y = lane.y - lane.top + 17 + (glyph.annotations.length - index - 1) * 22
      if (isSection) annotations.push(`<rect${attrs({ x: x - textWidth / 2 - 4, y: y - 16, width: textWidth + 8, height: 21, stroke: '#000', fill: 'none' })}/>`)
      annotations.push(this.text(annotation, x, y, 14, 'serif', { 'text-anchor': 'middle', 'font-weight': isSection ? 700 : 400, 'data-m3n-id': glyph.xmlId, 'data-m3n-role': 'annotation', 'data-m3n-system': system.index, 'data-m3n-measure': glyph.measureId }))
    })
    const lyrics: string[] = []
    for (const [row, data] of glyph.lyrics) {
      const visible = lane.rows.indexOf(row), text = data.texts.join('')
      const y = lane.y + (lane.bodyBottom ?? glyph.bottom) + 22 * (0.32 + 0.82 * 0.8) + Math.max(0, visible) * 22 * (0.82 + 0.24)
      const meta = { 'data-m3n-id': glyph.xmlId, 'data-m3n-rendition': row + 1, 'data-m3n-passes': [...(data.passes ?? [row + 1])].join('-'), 'data-m3n-system': system.index, 'data-m3n-measure': glyph.measureId }
      lyrics.push(this.text(text || '\u200B', glyph.x, y, 22 * 0.82, 'serif', { ...meta, 'text-anchor': 'middle', 'data-m3n-role': 'lyric', 'data-m3n-underlined': data.underlined ? 'true' : undefined }))
      const width = this.layout.measurer.measureText(text, { fontSize: 16 }).w
      if (data.underlined) lyrics.push(line(glyph.x - width / 2, y + 3, glyph.x + width / 2, y + 3, 0.8))
      if (data.annotation) lyrics.push(this.text(data.annotation, glyph.x - width / 2 - 4, y, 12, 'serif', { ...meta, 'text-anchor': 'end', 'data-m3n-role': 'lyric-prefix' }))
    }
    let controls = '', cursor = glyph.x - glyph.left - glyph.controls.reduce((sum, control) => sum + control.width, 0)
    for (const control of glyph.controls) {
      const x = control.x ?? cursor
      let mark = ''
      if (control.kind === 'section') {
        mark += `<g${attrs({ 'data-m3n-role': 'section', 'data-m3n-id': glyph.xmlId })}><rect${attrs({ x: x + 0.5, y: glyph.y - control.top + 0.5, width: control.width - 1, height: control.top + control.bottom - 1, stroke: '#000', fill: 'none' })}/>${this.text(control.text, x + 3.5, glyph.y - 2.4, 14, 'serif', { 'font-weight': 700 })}</g>`
      } else if (control.kind === 'tempo') mark += this.tempo(control.text, x, glyph.y - 2)
      else if (control.kind === 'segno') mark += this.segno(x, glyph.y)
      else if (control.kind === 'meter') {
        const [numerator, denominator] = control.text.split('/')
        mark += this.text(numerator!, x + control.width / 2, glyph.y - 12.18, 18, 'M3N Numbers', { 'text-anchor': 'middle' })
          + `<rect${attrs({ x, y: glyph.y - 7.14, width: control.width, height: 1.08, fill: '#000' })}/>`
          + this.text(denominator!, x + control.width / 2, glyph.y + 9.78, 18, 'M3N Numbers', { 'text-anchor': 'middle' })
      } else mark += this.text(control.text, x, glyph.y - 1.8, 16, 'M3N Numbers')
      controls += `<g${attrs({ 'data-m3n-role': 'control', 'data-m3n-control': control.kind, 'data-m3n-id': glyph.xmlId })}>${mark}</g>`
      cursor += control.width
    }
    return group + controls + annotations.join('') + lyrics.join('')
  }

  bar(kind: string | undefined, x: number, y: number): string {
    const geometry = nativeBarMetrics(kind), top = y - 6.6 - geometry.size / 2
    let svg = ''
    for (const bar of geometry.bars) svg += `<rect${attrs({ x: x - geometry.anchor + bar.x, y: top, width: bar.width, height: geometry.size, fill: '#000' })}/>`
    for (const dot of geometry.dots) for (const ratio of [0.38, 0.62]) svg += circle(x - geometry.anchor + dot, top + geometry.size * ratio, geometry.radius)
    return svg
  }

  measure(measure: NativeMeasure, system: NativeSystem): string {
    let content = ''
    const marks = nativeMeasureBars(system.measures, system.measures.indexOf(measure))
    const glyphs = measure.columns.flatMap(column => column.glyphs)
    for (const lane of system.lanes) {
      const members = glyphs.filter(glyph => glyph.lane === lane.id)
      if (!members.length) continue
      for (const glyph of members) content += this.glyph(glyph, system, lane)
      if (!lane.id.startsWith('alternative:')) {
        if (marks.opening) content += this.bar('rptstart', measure.openingBarX ?? measure.start + 2, lane.y)
        if (marks.closing !== undefined) content += this.bar(marks.closing, measure.barX ?? measure.end - 3, lane.y)
      } else {
        content += this.text('(', members[0]!.x - members[0]!.left - 6, lane.y, 22, 'M3N Numbers')
        content += this.text(')', members.at(-1)!.x + members.at(-1)!.right + 2, lane.y, 22, 'M3N Numbers')
        const passes = members[0]!.passes
        if (passes?.join(',') !== '2') content += this.text(`${passes?.join('.')}.`, members[0]!.x, lane.y - lane.top + 12, 12)
      }
    }
    if (measure.lastFragment) {
      if (measure.navigation?.length) {
        const lane = system.lanes.find(lane => lane.id === 'melody')!
        for (const mark of measure.navigation) content += this.text(mark.text, mark.x ?? measure.end - 19, lane.y - 6.6 + mark.size * 0.3, mark.size, '"Times New Roman", serif', { 'data-m3n-role': 'navigation' })
      }
      if ((measure.source.repeatCount ?? 2) > 2) content += this.text(`×${measure.source.repeatCount}`, measure.end - 3, system.top + 14, 12, 'serif', { 'text-anchor': 'end' })
    }
    if (this.layout.options.measureNumbers && !measure.continuation) {
      const first = glyphs.find(glyph => glyph.lane === 'melody')
      if (first) content += this.text(String(measure.index + 1), Math.max(measure.start + 2, first.x - first.left), system.top + 12, 10, 'serif', { 'data-m3n-role': 'annotation', 'data-m3n-id': first.xmlId })
    }
    return `<g${attrs({ class: 'measure', id: measure.continuation ? `${measure.id}-s${system.index}` : measure.id, 'data-m3n-measure-id': measure.id, 'data-m3n-measure-start': measure.start, 'data-m3n-measure-end': measure.end })}>${content}</g>`
  }

  relation(relation: NativeRelation, system: NativeSystem): string {
    const members = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs)).filter(glyph => glyph.lane === relation.first.lane)
    const lane = system.lanes.find(lane => lane.id === relation.first.lane)
    if (!members.length || !lane) return ''
    const firstHere = members.includes(relation.first), lastHere = members.includes(relation.last)
    const x1 = firstHere ? relation.first.x : system.measures[0]!.start + 4
    const x2 = lastHere ? relation.last.x : system.measures.at(-1)!.end - 5
    const top = Math.min(...members.map(glyph => glyph.y - glyph.top)) - 6 - relation.level * 14
    if (relation.kind === 'inst') {
      const selected = members.filter(glyph => glyph.event && relation.first.event!.sourceStart <= glyph.event.sourceStart && glyph.event.sourceStart <= relation.last.event!.sourceStart)
      if (!selected.length) return ''
      const first = selected[0]!, last = selected.at(-1)!
      return this.text('(', first.x - first.left - (first.parenthesisLeft ?? 6), lane.y, 22, 'M3N Numbers', { 'data-m3n-role': 'instrument-parenthesis' })
        + this.text(')', last.x + last.right + 1.1, lane.y, 22, 'M3N Numbers', { 'data-m3n-role': 'instrument-parenthesis' })
    }
    if (relation.kind === 'tie' || relation.kind === 'slur') {
      const arc = nativeArcGeometry(relation, system)
      return `<path${attrs({ d: nativeArcPath(arc), fill: '#000', transform: `translate(0 ${n(lane.y)})`, 'data-m3n-relation': relation.kind })}/>`
    }
    if (relation.kind === 'cresc' || relation.kind === 'decres') {
      const end = Math.max(x1 + 14, x2), openLeft = relation.kind === 'decres'
      return line(x1, top - (openLeft ? 4 : 0), end, top - (openLeft ? 0 : 4)) + line(x1, top + (openLeft ? 4 : 0), end, top + (openLeft ? 0 : 4))
    }
    if (relation.kind === 'tuplet') {
      const bracket = nativeTupletGeometry(relation, system, this.layout.measurer)
      return `<g${attrs({ transform: `translate(0 ${n(lane.y)})`, 'data-m3n-relation': 'tuplet' })}>`
        + bracket.segments.map(([a, b, c, d]) => line(a, b, c, d, bracket.stroke)).join('')
        + this.text(relation.label!, bracket.center, bracket.baseline, bracket.fontSize, 'serif', { 'text-anchor': 'middle' }) + '</g>'
    }
    return this.text(relation.label!, x1, top - 3, 12) + line(x1 + 26, top - 5, Math.max(x1 + 26, x2), top - 5, 1, ' stroke-dasharray="4 3"') + line(x2, top - 5, x2, top + 1)
  }

  system(system: NativeSystem): string {
    let svg = system.measures.map(measure => this.measure(measure, system)).join('')
    // Join short-note underlines according to the active meter's beat grid.
    for (const measure of system.measures) for (const lane of system.lanes) {
      const glyphs = measure.columns.flatMap(column => column.glyphs).filter(glyph => glyph.lane === lane.id)
      for (let index = 1; index < glyphs.length; index++) {
        const a = glyphs[index - 1]!, b = glyphs[index]!
        const beams = nativeBeamCount(a, b)
        for (let beam = 0; beam < beams; beam++) svg += line(a.x + 5.577, a.y + 3.245 + beam * 3.08, b.x - 5.577, b.y + 3.245 + beam * 3.08, 1.21)
      }
    }
    for (const relation of system.relations) svg += this.relation(relation, system)
    for (let index = 0; index < system.measures.length;) {
      const measure = system.measures[index]!, ending = measure.source.ending
      if (!ending) { index++; continue }
      const first = index
      while (system.measures[index + 1]?.source.ending === ending) index++
      const x1 = system.measures[first]!.start + 2, x2 = system.measures[index]!.end - 3, y = system.top + 7
      svg += line(x1, y + 6, x1, y) + line(x1, y, x2, y) + line(x2, y, x2, y + 6) + this.text(ending.replaceAll(',', '.') + '.', x1 + 5, y + 15, 12)
      index++
    }
    const melody = system.lanes.find(lane => lane.id === 'melody'), bass = system.lanes.find(lane => lane.id === 'bass')
    if (melody && bass) {
      const x = this.layout.margin + 2, top = melody.y - 24, bottom = bass.y + 10
      svg += path(`M${n(x + 7)} ${n(top)} L${n(x)} ${n(top)} L${n(x)} ${n(bottom)} L${n(x + 7)} ${n(bottom)}`, 'none', ' data-m3n-role="voice-connector"')
    }
    const paragraphs = [...new Set(system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs.map(glyph => glyph.paragraph))))]
    return `<g${attrs({ class: 'system', id: `m3n-system-${system.page + 1}-${system.index}`, 'data-m3n-volta': String(system.volta), 'data-m3n-paragraph': paragraphs.join(','), 'data-m3n-top': system.top, 'data-m3n-bottom': system.bottom })}>${svg}</g>`
  }

  header(): string {
    const { document, options, margin, measurer } = this.layout
    const geometry = nativeHeaderGeometry(document, options.width, margin, measurer, options.systemGap ?? 24)
    let svg = ''
    for (const [lines, size, top, step, weight] of [[geometry.title, 32, geometry.titleTop, 40, 700], [geometry.subtitle, 16, geometry.subtitleTop, 20, 400]] as const) for (const [index, text] of lines.entries()) {
      svg += this.text(text, options.width / 2, top + size * 0.8 + index * step, size, 'serif', { 'text-anchor': 'middle', 'font-weight': weight })
    }
    const credits = scoreCreditLines(document).map(text => { const colon = text.indexOf('：'); return [text.slice(0, colon + 1), text.slice(colon + 1)] as const })
    const nameWidth = Math.max(0, ...credits.map(([, name]) => measurer.measureText(name, { fontSize: 14 }).w))
    const labelWidth = Math.max(0, ...credits.map(([label]) => measurer.measureText(label, { fontSize: 14 }).w))
    for (const [index, [label, name]] of credits.entries()) {
      const baseline = geometry.creditsTop + 14 * 0.8 + 21 * index
      svg += this.text(label, options.width - margin - nameWidth - labelWidth - 16, baseline, 14)
      svg += this.text(name, options.width - margin, baseline, 14, 'serif', { 'text-anchor': 'end' })
    }
    const signaturesY = geometry.signaturesTop + 24.78
    const signatures = [`1=${document.key}`, `${document.meterCount}/${document.meterUnit}`]
    if (document.hasExplicitTempo) {
      const tempo = displayedTempo(document.tempo, document.meterCount, document.meterUnit)
      signatures.push(`${tempo.unit === 8 ? '♪' : '♩'} = ${Number(tempo.bpm.toFixed(2))}`)
    }
    let x = margin
    for (const signature of signatures) {
      if (signature === `${document.meterCount}/${document.meterUnit}`) {
        const numerator = String(document.meterCount), denominator = String(document.meterUnit)
        const meterWidth = Math.max(measurer.measureText(numerator, {fontSize:18,fontFamily:'M3N Numbers'}).w, measurer.measureText(denominator, {fontSize:18,fontFamily:'M3N Numbers'}).w) + 2.88
        svg += this.text(numerator, x + meterWidth / 2, geometry.signaturesTop + 14.4, 18, 'M3N Numbers', {'text-anchor':'middle'})
          + `<rect${attrs({x,y:geometry.signaturesTop+19.44,width:meterWidth,height:1.08,fill:'#000'})}/>`
          + this.text(denominator, x + meterWidth / 2, geometry.signaturesTop + 36.36, 18, 'M3N Numbers', {'text-anchor':'middle'})
        x += meterWidth + 16
      } else {
        svg += /^[♪♩]/.test(signature) ? this.tempo(signature, x, signaturesY) : this.text(signature, x, signaturesY, 16, 'M3N Numbers')
        x += measurer.measureText(signature, { fontSize: 16, fontFamily: 'M3N Numbers' }).w + 16
      }
    }
    for (const row of geometry.orderRows) for (const item of row.items) {
      if (item.framed) svg += `<rect${attrs({ x: item.x + 0.5, y: item.y + 0.5, width: item.width - 1, height: item.height - 1, fill: 'none', stroke: '#000' })}/>`
      svg += this.text(item.text, item.x + (item.framed ? 3.5 : 0), item.baseline, 16, 'serif', { 'font-weight': item.framed ? 700 : 400, 'data-m3n-role': item.framed ? 'order' : 'order-prefix' })
    }
    return svg
  }
}

export function renderNativePages(layout: NativeLayout): string[] {
  const painter = new SvgPainter(layout)
  try {
    return layout.pages.map(page => `<svg${attrs({ xmlns: 'http://www.w3.org/2000/svg', width: page.width, height: page.height, viewBox: `0 0 ${page.width} ${page.height}`, 'data-engine': 'm3n', role: 'img', 'aria-label': layout.document.title || '简谱' })}><defs><style>${NUMBER_FONT_CSS}</style></defs><rect width="100%" height="100%" fill="#fff"/>${page.index === 0 ? painter.header() : ''}${page.systems.map(system => painter.system(system)).join('')}</svg>`)
  } finally { painter.dispose() }
}
