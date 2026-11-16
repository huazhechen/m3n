import { displayedTempo, scoreCreditLines } from '@m3n/notation'
import { NUMBER_FONT_CSS } from './font-data.js'
import { wrapNativeText, type NativeLayout, type NativeLane, type NativeRelation, type NativeSystem } from './native-layout.js'
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

  pitch(pitch: NativePitch, x: number, y: number, size = 22): string {
    const scale = size / 22
    let svg = this.text(pitch.degree, x, y, size, 'M3N Numbers', { 'text-anchor': 'middle' })
    if (pitch.accidental) svg += this.text(pitch.accidental, x - size * 0.44, y - size * 0.07, size * 0.68, 'serif', { 'text-anchor': 'end' })
    for (let index = 0; index < Math.abs(pitch.octave); index++) svg += circle(x, y + (pitch.octave > 0 ? -size - (index + 0.3) * 6 * scale : (index + 1.2) * 6 * scale), 1.5 * scale)
    return svg
  }

  tempo(text: string, x: number, y: number): string {
    const eighth = text.startsWith('♪'), value = text.replace(/^[♪♩]\s*/, '')
    let svg = `<ellipse${attrs({ cx: x + 4, cy: y - 4, rx: 4, ry: 2.6, fill: '#000' })}/>` + line(x + 7, y - 5, x + 7, y - 21, 1.2)
    if (eighth) svg += path(`M${n(x + 7)} ${n(y - 21)} q10 4 5 11 q2 -6 -5 -7`, '#000')
    return svg + this.text(value, x + 20, y, 16, 'M3N Numbers')
  }

  segno(x: number, y: number): string {
    return path(`M${n(x + 12)} ${n(y - 23)} C${n(x - 6)} ${n(y - 24)} ${n(x + 18)} ${n(y)} ${n(x)} ${n(y - 1)} M${n(x - 1)} ${n(y - 1)} L${n(x + 13)} ${n(y - 23)}`) + circle(x, y - 16, 1.7) + circle(x + 12, y - 7, 1.7)
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
    if (glyph.sustain) music += line(glyph.x - 5, glyph.y - 7, glyph.x + 5, glyph.y - 7, 1.8)
    else {
      glyph.pitches.forEach((pitch, index) => { music += this.pitch(pitch, glyph.x, glyph.y - index * 29) })
      if (glyph.multiRest) music += this.text(String(glyph.multiRest), glyph.x, glyph.y - 26, 13, 'M3N Numbers', { 'text-anchor': 'middle' })
      const base = 2 ** Math.floor(Math.log2(glyph.writtenBeats)), ratio = glyph.writtenBeats / base
      const dots = [1, 1.5, 1.75, 1.875].findIndex(value => Math.abs(ratio - value) < 1e-7)
      for (let index = 0; index < dots; index++) music += circle(glyph.x + 11 + index * 5, glyph.y - 7)
      const beams = Math.max(0, Math.round(-Math.log2(base)))
      for (let index = 0; index < beams; index++) music += line(glyph.x - 6, glyph.y + 7 + index * 4, glyph.x + 7, glyph.y + 7 + index * 4, 1.2)
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
      const y = lane.y + Math.max(glyph.bottom, 12) + 22 + Math.max(0, visible) * 24
      const meta = { 'data-m3n-id': glyph.xmlId, 'data-m3n-rendition': row + 1, 'data-m3n-passes': [...(data.passes ?? [row + 1])].join('-'), 'data-m3n-system': system.index, 'data-m3n-measure': glyph.measureId }
      lyrics.push(this.text(text || '\u200B', glyph.x, y, 16, 'serif', { ...meta, 'text-anchor': 'middle', 'data-m3n-role': 'lyric', 'data-m3n-underlined': data.underlined ? 'true' : undefined }))
      const width = this.layout.measurer.measureText(text, { fontSize: 16 }).w
      if (data.underlined) lyrics.push(line(glyph.x - width / 2, y + 3, glyph.x + width / 2, y + 3, 0.8))
      if (data.annotation) lyrics.push(this.text(data.annotation, glyph.x - width / 2 - 4, y, 12, 'serif', { ...meta, 'text-anchor': 'end', 'data-m3n-role': 'lyric-prefix' }))
    }
    let controls = '', cursor = glyph.x - glyph.left - glyph.controls.reduce((sum, control) => sum + control.width, 0)
    for (const control of glyph.controls) {
      const x = cursor + 3
      if (control.kind === 'section') {
        const height = 23, width = control.width - 4
        controls += `<g${attrs({ 'data-m3n-role': 'section', 'data-m3n-id': glyph.xmlId })}><rect${attrs({ x, y: glyph.y - 20, width, height, stroke: '#000', fill: 'none' })}/>${this.text(control.text, x + width / 2, glyph.y - 3, 14, 'serif', { 'font-weight': 700, 'text-anchor': 'middle' })}</g>`
      } else if (control.kind === 'tempo') controls += this.tempo(control.text, x, glyph.y - 2)
      else if (control.kind === 'segno') controls += this.segno(x, glyph.y)
      else controls += this.text(control.text, x, glyph.y - 2, 16, 'serif')
      cursor += control.width
    }
    return group + controls + annotations.join('') + lyrics.join('')
  }

  bar(kind: string | undefined, x: number, y: number): string {
    const top = y - 23, bottom = y + 8
    if (kind === 'rptstart') return line(x, top, x, bottom, 3) + line(x + 5, top, x + 5, bottom) + circle(x + 10, y - 13) + circle(x + 10, y - 3)
    if (kind === 'rptend' || kind === 'rptboth') return circle(x - 10, y - 13) + circle(x - 10, y - 3) + line(x - 5, top, x - 5, bottom) + line(x, top, x, bottom, 3)
    if (kind === 'end') return line(x - 5, top, x - 5, bottom) + line(x, top, x, bottom, 3)
    if (kind === 'dbl') return line(x - 4, top, x - 4, bottom) + line(x, top, x, bottom)
    return line(x, top, x, bottom)
  }

  measure(measure: NativeMeasure, system: NativeSystem): string {
    let content = ''
    const glyphs = measure.columns.flatMap(column => column.glyphs)
    for (const lane of system.lanes) {
      const members = glyphs.filter(glyph => glyph.lane === lane.id)
      if (!members.length) continue
      for (const glyph of members) content += this.glyph(glyph, system, lane)
      if (!lane.id.startsWith('alternative:')) {
        if (!measure.continuation && measure.source.left === 'rptstart') content += this.bar('rptstart', measure.start + 2, lane.y)
        const closed = measure.lastFragment ? measure.source.right : undefined
        content += this.bar(closed, measure.end - 3, lane.y)
        if (closed === 'rptboth' && system.measures.at(-1) !== measure) content += this.bar('rptstart', measure.end + 2, lane.y)
      } else {
        content += this.text('(', members[0]!.x - members[0]!.left - 6, lane.y, 22, 'M3N Numbers')
        content += this.text(')', members.at(-1)!.x + members.at(-1)!.right + 2, lane.y, 22, 'M3N Numbers')
        const passes = members[0]!.passes
        if (passes?.join(',') !== '2') content += this.text(`${passes?.join('.')}.`, members[0]!.x, lane.y - lane.top + 12, 12)
      }
    }
    if (measure.lastFragment) {
      const navigation = [...new Set([...(measure.source.navigation ?? []), ...measure.source.events.flatMap(event => event.navigation)])].filter(value => value !== 'segno')
      if (navigation.length) {
        const lane = system.lanes.find(lane => lane.id === 'melody')!
        content += this.text(navigation.map(value => value === 'fine' ? 'Fine' : value === 'dc' ? 'D.C.' : 'D.S.').join(' '), measure.end - 19, lane.y - 3, 12, 'serif', { 'text-anchor': 'end' })
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
    const width = Math.max(12, x2 - x1)
    const top = Math.min(...members.map(glyph => glyph.y - glyph.top)) - 6 - relation.level * 14
    if (relation.kind === 'inst') {
      const selected = members.filter(glyph => glyph.event && relation.first.event!.sourceStart <= glyph.event.sourceStart && glyph.event.sourceStart <= relation.last.event!.sourceStart)
      if (!selected.length) return ''
      const first = selected[0]!, last = selected.at(-1)!
      return this.text('(', first.x - first.left - 6, lane.y, 22, 'M3N Numbers') + this.text(')', last.x + last.right + 2, lane.y, 22, 'M3N Numbers')
    }
    if (relation.kind === 'tie' || relation.kind === 'slur') {
      const rise = Math.min(12, Math.max(5, width * 0.08)), y = top
      return path(`M${n(x1)} ${n(y)} C${n(x1 + width / 3)} ${n(y - rise)} ${n(x2 - width / 3)} ${n(y - rise)} ${n(x2)} ${n(y)} C${n(x2 - width / 3)} ${n(y - rise - 2)} ${n(x1 + width / 3)} ${n(y - rise - 2)} ${n(x1)} ${n(y)} Z`, '#000', ` data-m3n-relation="${relation.kind}"`)
    }
    if (relation.kind === 'cresc' || relation.kind === 'decres') {
      const end = Math.max(x1 + 14, x2), openLeft = relation.kind === 'decres'
      return line(x1, top - (openLeft ? 4 : 0), end, top - (openLeft ? 0 : 4)) + line(x1, top + (openLeft ? 4 : 0), end, top + (openLeft ? 0 : 4))
    }
    if (relation.kind === 'tuplet') return line(x1 - 5, top, x1 - 5, top - 4) + line(x1 - 5, top - 4, x2 + 5, top - 4) + line(x2 + 5, top - 4, x2 + 5, top) + `<rect${attrs({ x: (x1 + x2) / 2 - 7, y: top - 18, width: 14, height: 18, fill: '#fff' })}/>` + this.text(relation.label!, (x1 + x2) / 2, top - 1, 22 * 0.72, 'M3N Numbers', { 'text-anchor': 'middle' })
    return this.text(relation.label!, x1, top - 3, 12) + line(x1 + 26, top - 5, Math.max(x1 + 26, x2), top - 5, 1, ' stroke-dasharray="4 3"') + line(x2, top - 5, x2, top + 1)
  }

  system(system: NativeSystem): string {
    let svg = system.measures.map(measure => this.measure(measure, system)).join('')
    // Join short-note underlines according to the active meter's beat grid.
    for (const measure of system.measures) for (const lane of system.lanes) {
      const glyphs = measure.columns.flatMap(column => column.glyphs).filter(glyph => glyph.lane === lane.id)
      for (let index = 1; index < glyphs.length; index++) {
        const a = glyphs[index - 1]!, b = glyphs[index]!
        if (a.sustain || b.sustain || a.pitches[0]?.degree === '0' || b.pitches[0]?.degree === '0') continue
        const unit = a.event?.meterUnit ?? this.layout.document.meterUnit, count = a.event?.meterCount ?? this.layout.document.meterCount
        const group = 4 / unit * (unit >= 8 && count % 3 === 0 ? 3 : 1)
        if (a.event?.kind !== 'tuplet' && Math.floor((a.time + 1e-8) / group) !== Math.floor((b.time + 1e-8) / group)) continue
        if (a.event?.kind === 'tuplet' && a.event !== b.event) continue
        const beams = Math.max(0, -Math.floor(Math.log2(Math.max(a.writtenBeats, b.writtenBeats))))
        for (let beam = 0; beam < beams; beam++) svg += line(a.x + 7, a.y + 7 + beam * 4, b.x - 6, b.y + 7 + beam * 4, 1.2)
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
    const { document, options, margin, measurer } = this.layout, width = options.width - 2 * margin
    let svg = '', y = margin
    for (const [value, size, step, weight] of [[document.title, 32, 42, 700], [document.subtitle, 16, 24, 400]] as const) for (const text of wrapNativeText(value, width - 2, size, measurer, weight)) {
      y += step
      svg += this.text(text, options.width / 2, y - 8, size, 'serif', { 'text-anchor': 'middle', 'font-weight': weight })
    }
    const credits = scoreCreditLines(document).map(text => { const colon = text.indexOf('：'); return [text.slice(0, colon + 1), text.slice(colon + 1)] as const })
    const nameWidth = Math.max(0, ...credits.map(([, name]) => measurer.measureText(name, { fontSize: 14 }).w))
    const labelWidth = Math.max(0, ...credits.map(([label]) => measurer.measureText(label, { fontSize: 14 }).w))
    for (const [index, [label, name]] of credits.entries()) {
      const baseline = y + 21 * (index + 1)
      svg += this.text(label, options.width - margin - nameWidth - labelWidth - 16, baseline, 14)
      svg += this.text(name, options.width - margin, baseline, 14, 'serif', { 'text-anchor': 'end' })
    }
    const signaturesY = y + (options.width < 600 ? credits.length * 21 + 26 : 22)
    const signatures = [`1=${document.key}`, `${document.meterCount}/${document.meterUnit}`]
    if (document.hasExplicitTempo) {
      const tempo = displayedTempo(document.tempo, document.meterCount, document.meterUnit)
      signatures.push(`${tempo.unit === 8 ? '♪' : '♩'} = ${Number(tempo.bpm.toFixed(2))}`)
    }
    let x = margin
    for (const signature of signatures) {
      svg += /^[♪♩]/.test(signature) ? this.tempo(signature, x, signaturesY) : this.text(signature, x, signaturesY, 16, 'M3N Numbers')
      x += measurer.measureText(signature, { fontSize: 16, fontFamily: 'M3N Numbers' }).w + 16
    }
    y += Math.max(credits.length * 21, options.width < 600 ? credits.length * 21 + 28 : 28) + 8
    if (document.order) {
      let x = margin
      y += 24
      svg += this.text('演奏顺序：', x, y, 16); x += 100
      for (const [index, name] of document.order.entries()) {
        const box = measurer.measureText(name, { fontSize: 16, fontWeight: 700 }).w + 12
        if (x + box + 30 > options.width - margin) { y += 34; x = margin }
        if (index) { svg += this.text('→', x, y, 16); x += 24 }
        svg += `<rect${attrs({ x, y: y - 19, width: box, height: 25, fill: 'none', stroke: '#000' })}/>` + this.text(name, x + box / 2, y, 16, 'serif', { 'text-anchor': 'middle', 'font-weight': 700, 'data-m3n-role': 'order' })
        x += box + 7
      }
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
