import { staffSlur } from './staff-slur.js'
import { SCORE_TEXT_FONT, scoreLayoutConfig, scoreDynamicGlyph } from '@m3n/numbered-notation'
import { displayedTempo, numberedHeadingLines } from '@m3n/notation'
import { createStaffMeasure, drawStaffMeasure, drawStaffTie, STAFF_SCALE, type StaffMeasureLayout, type StaffPreparation, type StaffNoteAnchor } from './staff-engine.js'
import { staffMusicSize, staffGlyph, staffNavigationGlyph, type StaffGlyph } from './staff-music-font.js'
import type { StaffDocument, StaffEvent } from './staff-document.js'
import type { StaffLine } from './line-layout.js'
import { staffLyricDrawing } from './staff-lyric-drawing.js'
import { arrangeStaffSystem } from './system-layout.js'
import { element, nodes, readXml, hasClass, SvgGeometry, type XmlNode, type Ink, type MeasureText } from './layout-svg.js'

const style = scoreLayoutConfig.staff
const engine = style.engine

// Projection identity and this map both belong to one measurement task.
const relationPlans = new WeakMap<StaffPreparation, WeakMap<StaffDocument, ReturnType<typeof prepareSystemRelations>>>()
function prepareSystemRelations(document: StaffDocument) {
  const allEvents = document.measures.flatMap(m => [m.melody, m.bass].flat())
  const intervals = document.score.intervals.flatMap(interval => {
    const start = allEvents.find(e => e.event.sourceStart === interval.start && document.measures.some(m => (interval.staff === 'bass' ? m.bass : m.melody).includes(e)))
    const end = allEvents.find(e => e.event.sourceStart === interval.endStart && document.measures.some(m => (interval.staff === 'bass' ? m.bass : m.melody).includes(e)))
    return start && end ? [{ interval, start, end }] : []
  })
  // Build ties from semantic adjacency, including tuplet exits and chords.
  const ties: Array<{ start: StaffEvent; end: StaffEvent }> = []
  for (const lane of ['melody', 'bass'] as const) {
    let previous: StaffEvent | undefined
    for (const m of document.measures) for (const e of m[lane]) {
      if (previous?.event.tie) ties.push({ start: previous, end: e })
      for (const slot of e.event.tupletTies ?? []) {
        const start = e.children?.[slot], end = e.children?.[slot + 1]
        if (start && end) ties.push({ start, end })
      }
      for (const [from, to] of e.event.tupletSlurs ?? []) {
        const start = e.children?.[from], end = e.children?.[to]
        if (start && end) intervals.push({ interval: { id: -1, kind: 'lg', staff: lane }, start, end })
      }
      previous = e
    }
  }
  const endpoints = new Set<string>()
  const intervalEndpoints = new Set<string>()
  for (const { start, end } of [...intervals, ...ties]) { endpoints.add(start.id); endpoints.add(end.id) }
  for (const { start, end } of intervals) { intervalEndpoints.add(start.id); intervalEndpoints.add(end.id) }
  const endingRanges = new Map<string, { start: string; index: number }>()
  let range: { start: string; index: number } | undefined, rangeCount = 0
  let previousEnding: string | undefined
  for (const measure of document.measures) {
    const ending = measure.source.ending
    if (ending && ending !== previousEnding) range = { start: measure.id, index: ++rangeCount }
    if (ending && range) endingRanges.set(measure.id, range)
    previousEnding = ending
  }
  return { intervals, ties, endpoints, intervalEndpoints, endingRanges }
}

function verseAttributes(child: StaffEvent, lyric: StaffEvent['lyrics'][number], slot?: number): Record<string, string> {
  const attrs: Record<string, string> = { id: `${child.id}-v${lyric.verseIndex}`, class: `verse${lyric.passes && lyric.passes.size > 1 ? ` m3n-passes-${[...lyric.passes].join('-')}` : ''}` }
  attrs['data-m3n-id'] = child.id.replace(/-n\d+$/, '').replace(/-rend\d+$/, '')
  if (slot !== undefined) attrs['data-m3n-tuplet-slot'] = String(slot)
  attrs['data-m3n-rendition'] = String(lyric.verseIndex)
  const performedPass = /-rend(\d+)/.exec(child.id)?.[1]
  if (performedPass) attrs['data-m3n-passes'] = performedPass
  else if (lyric.passes) attrs['data-m3n-passes'] = [...lyric.passes].join('-')
  return attrs
}

export function engraveStaffSystems(document: StaffDocument, lines: StaffLine[], width: number, measureText: MeasureText, spacing: number, measureNumbers: boolean, tempoScale = 1,
  preparation?: StaffPreparation) {
  const scale = STAFF_SCALE, rawWidth = width / scale
  const text = (value: string, x: number, y: number, size: number, cls: string, attrs: Record<string, string> = {}) => {
    const { 'data-m3n-staff': lane, ...textAttrs } = attrs
    return element('g', { class: cls, ...(lane === undefined ? {} : { 'data-m3n-staff': lane }) }, [
      element('text', { x: String(x), y: String(y), 'font-size': String(size / scale),
        'font-family': SCORE_TEXT_FONT, 'font-weight': String(scoreLayoutConfig.fonts.textWeight), ...textAttrs }, [value]),
    ])
  }
  const wrap = (value: string, x: number, y: number, cls: string, bold = false) => {
    const rows = numberedHeadingLines(value, rawWidth - style.attachmentWrapInset / scale, style.annotation / scale, { measureText: (s: string, style: { fontSize: number }) => ({ w: measureText(s, style.fontSize, bold).width }) }, bold ? scoreLayoutConfig.fonts.boldWeight : scoreLayoutConfig.fonts.regularWeight)
    return element('g', { class: cls }, rows.map((s, i) => nodes(text(s, x, y + i * style.annotationLineHeight / scale, style.annotation, cls, bold ? { 'font-weight': String(scoreLayoutConfig.fonts.boldWeight) } : {}))[0]!))
  }
  let plans = preparation && relationPlans.get(preparation)
  if (preparation && !plans) { plans = new WeakMap(); relationPlans.set(preparation, plans) }
  let relations = plans?.get(document)
  if (!relations) { relations = prepareSystemRelations(document); plans?.set(document, relations) }
  const { intervals, ties, endpoints, intervalEndpoints, endingRanges } = relations
  const lineOf = new Map<string, number>()
  lines.forEach((line, i) => line.measures.forEach(m => {
    for (const lane of [m.measure.melody, m.measure.bass]) for (const e of lane) {
      if (intervalEndpoints.has(e.id)) lineOf.set(e.id, i)
      for (const child of e.children ?? []) if (intervalEndpoints.has(child.id)) lineOf.set(child.id, i)
    }
  }))
  return lines.map((line, lineIndex) => {
    let bassY = engine.initialBassY
    for (let pass = 0; pass < 8; pass++) {
      const addTempo = (qpm: number, meterCount: number, meterUnit: number, tempoX: number, parent: XmlNode) => {
          const display = displayedTempo(qpm, meterCount, meterUnit)
          const tempo = element('g', { class: 'tempo' })
          const codes: Record<number, string> = { 1: 'noteheadWhole', 2: 'noteheadHalf', 4: 'noteheadBlack', 8: 'noteheadBlack', 16: 'noteheadBlack' }
          const glyph = [staffGlyph((codes[display.unit] ?? 'noteheadBlack') as StaffGlyph, tempoX, (staffMusicSize() / 4 * -3), (style.music * .8) / scale)]
          tempo.children.push(...glyph)
          if (display.unit !== 1) tempo.children.push(element('path', { d: `M${tempoX + (staffMusicSize() / 4 * 0.9)} ${(staffMusicSize() / 4 * -3.1)} v${-(staffMusicSize() / 4 * 2.4)}`, stroke: '#000', 'stroke-width': String((staffMusicSize() / 4 * 0.13)), fill: 'none' }))
          if (display.unit >= 8) {
            const flags: Record<number, string> = { 8: 'flag8Up', 16: 'flag16Up', 32: 'flag32Up', 64: 'flag64Up' }
            tempo.children.push(staffGlyph((flags[display.unit] ?? 'flag8Up') as StaffGlyph, tempoX + (staffMusicSize() / 4 * 0.9), (staffMusicSize() / 4 * -5.5), (style.music * .8) / scale))
          }
          if (display.dots) tempo.children.push(element('circle', { cx: String(tempoX + (staffMusicSize() / 4 * 1.6)), cy: String((staffMusicSize() / 4 * -3.1)), r: String((staffMusicSize() / 4 * 0.18)), fill: '#000' }))
          tempo.children.push(...nodes(text(`= ${Number(display.bpm.toFixed(2))}`, tempoX + (display.dots ? (staffMusicSize() / 4 * 2.5) : (staffMusicSize() / 4 * 1.8)), (staffMusicSize() / 4 * -2.8), style.tempo, 'tempo-text')))
          parent.children.push(tempo)
      }
      const node = element('g', { class: 'system' })
      const models: StaffMeasureLayout[] = []
      const anchors = new Map<string, { first: StaffNoteAnchor; last: StaffNoteAnchor; item: StaffEvent; measure: XmlNode; staff: XmlNode }>()
      const inset = line.measures[0]!.inset
      const total = line.target - inset
      let x = 0
      for (const [index, member] of line.measures.entries()) {
        const model = createStaffMeasure(member.measure, index === 0, document.hasBass, measureText, spacing, bassY, preparation)
        const target = document.score.equalMeasures ? (total - (line.measures[0]!.head - inset)) / line.measures.length + (index ? 0 : member.head - inset) : member.body + (index ? 0 : member.head - inset) + (line.target - line.minimum) * member.weight / line.weight
        const measureNode = drawStaffMeasure(model, target, x)
        models.push(model)
        node.children.push(measureNode)
        for (const [lane, entries] of model.entries.entries()) {
          const staff = nodes(measureNode).filter(n => hasClass(n, 'staff'))[lane]!
          for (const entry of entries) {
            const item = entry.item
            if (endpoints.has(item.id)) anchors.set(item.id, { first: entry.notes[0]!, last: entry.notes.at(-1)!, item, measure: measureNode, staff })
            entry.notes.forEach((note, i) => {
              const child = item.children?.[i] ?? item
              if (item.children && endpoints.has(child.id)) anchors.set(child.id, { first: note, last: note, item: child, measure: measureNode, staff })
              if (!child.lyrics.length) return
              let lyricAttributes = preparation?.lyricAttributes.get(child)
              if (preparation && !lyricAttributes) {
                lyricAttributes = child.lyrics.map(lyric => verseAttributes(child, lyric, item.children ? i : undefined))
                preparation.lyricAttributes.set(child, lyricAttributes)
              }
              let cx: number | undefined
              for (const [lyricIndex, lyric] of child.lyrics.entries()) {
                const attrs = lyricAttributes ? { ...lyricAttributes[lyricIndex]! } : verseAttributes(child, lyric, item.children ? i : undefined)
                if (lyric.kind === 'placeholder') { staff.children.push(element('g', attrs)); continue }
                cx ??= (note.headLeft + note.headRight) / 2
                const value = lyric.kind === 'extender' ? '_' : lyric.text.replaceAll('~', ' ')
                const syl = staffLyricDrawing(value, cx, (model.staves[lane]!.y + (staffMusicSize() * 2)) + engine.lyricInitialOffset, Boolean(lyric.underlined && lyric.kind === 'text'), measureText, preparation?.lyricTexts)
                staff.children.push(element('g', attrs, [syl]))
              }
            })
            const event = item.event
            if (!(item.chord || event.text || event.sectionLabel || event.dynamic || event.prefix || event.navigation.length ||
              event.postfixes.some(value => /^f[1-5]$/.test(value)))) continue
            const cx = entry.notes[0]!.headLeft
            const top = Math.min(...entry.notes.flatMap(n => n.ys)) - engine.attachmentTopGap
            if (item.chord) measureNode.children.push(text(item.chord, cx, top, style.chord, 'harm'))
            if (event.text) measureNode.children.push(wrap(event.text, cx, top, 'dir'))
            if (event.sectionLabel) measureNode.children.push(wrap(event.sectionLabel, style.attachmentGap / scale, top, 'reh', true))
            if (event.dynamic || event.prefix) {
              const value = event.dynamic ?? event.prefix!
              const shape = scoreDynamicGlyph(value)
              const y = Math.max(...entry.notes.flatMap(n => n.ys)) + engine.dynamicBottomGap
              if (shape) measureNode.children.push(element('g', { class: 'dynam', 'data-m3n-staff': String(lane), transform: `translate(${cx} ${y}) scale(${1 / scale})` }, [{
                tagName: 'g', attributes: {}, children: [], numericInk: [shape.ink], renderNodes: () => [readXml(shape.svg)],
              }]))
              else measureNode.children.push(text(value, cx, y, style.dynamic, 'dynam', { 'font-style': 'italic', 'data-m3n-staff': String(lane) }))
            }
            for (const p of event.postfixes) if (/^f[1-5]$/.test(p)) measureNode.children.push(text(p.slice(1), cx, top, style.fingering, 'fing'))
            for (const nav of event.navigation) addNavigation(nav, cx, top, measureNode)
          }
        }
        for (const nav of member.measure.source.navigation ?? []) addNavigation(nav, x + target - engine.navigationBarInset, engine.navigationY, measureNode)
        if (member.measure.showTempo) addTempo(member.measure.tempo, member.measure.meterCount, member.measure.meterUnit, x + model.start, measureNode)
        for (const [i, entry] of model.entries[0]!.entries()) {
          const previous = model.entries[0]![i - 1]?.item.event.tempo
          const event = entry.item.event
          if (i > 0 && event.tempo !== undefined && event.tempo !== previous)
            addTempo(event.tempo * tempoScale, event.meterCount ?? member.measure.meterCount, event.meterUnit ?? member.measure.meterUnit, entry.notes[0]!.headLeft, measureNode)
        }
        if (member.measure.source.multiRest || member.measure.source.interlude) {
          const cx = x + model.start + (target - model.endInset - model.start) / 2, cy = (model.staves[0]!.y + (staffMusicSize() * 1.5))
          const count = member.measure.source.interlude ? '' : String(member.measure.source.multiRest)
          const countY = model.staves[0]!.y + staffMusicSize() - (staffMusicSize() / 4 * 0.1) / 2 - engine.restCountGap / scale - measureText(count, style.restCount / scale, true).descent
          measureNode.children.push(element('g', { class: 'rest multi-rest' + (member.measure.source.interlude ? ' interlude' : ''), ...(member.measure.source.interlude ? { 'data-m3n-role': 'interlude' } : {}) }, [element('path', { d: `M${cx - (staffMusicSize() / 4 * 2)} ${cy} h${(staffMusicSize() / 4 * 2) * 2} M${cx - (staffMusicSize() / 4 * 2)} ${cy - (staffMusicSize() / 4 * 0.8)} v${(staffMusicSize() / 4 * 0.8) * 2} M${cx + (staffMusicSize() / 4 * 2)} ${cy - (staffMusicSize() / 4 * 0.8)} v${(staffMusicSize() / 4 * 0.8) * 2}`, stroke: '#000', 'stroke-width': String((staffMusicSize() / 4 * 0.3)), fill: 'none' }), ...(count ? nodes(text(count, cx, countY, style.restCount, 'rest', { 'text-anchor': 'middle', 'font-weight': String(scoreLayoutConfig.fonts.boldWeight) })) : [])]))
        }
        // One spanning barline, redrawn after the final bass/lyric spacing pass.
        const y1 = (model.staves[0]!.y + staffMusicSize()), y2 = (model.staves.at(-1)!.y + (staffMusicSize() * 2))
        if (member.measure.source.right !== 'invis') measureNode.children.push(element('g', { class: 'barLine' }, [element('path', { d: `M${x + target} ${y1} V${y2}`, stroke: '#000', 'stroke-width': String((staffMusicSize() / 4 * 0.1)), fill: 'none' })]))
        if ((member.measure.source.repeatCount ?? 2) > 2) measureNode.children.push(text(`×${member.measure.source.repeatCount}`, x + target - engine.navigationBarInset, engine.navigationY, style.repeatCount, 'repeatMark'))
        if (measureNumbers && !member.measure.source.interlude && index === line.measures.length - 1) measureNode.children.push(text(String(member.measure.number), x + target, y1 - engine.measureNumberOffset, style.measureNumber, 'mNum', { 'text-anchor': 'end' }))
        x += target
      }
      function addNavigation(nav: string, x: number, y: number, parent: XmlNode) {
        const glyph = nav === 'segno' || nav === 'coda' ? [staffNavigationGlyph(nav, x, y)] : []
        parent.children.push(element('g', { class: 'repeatMark' }, glyph.length ? glyph : nodes(text(({ tocoda: 'To Coda', fine: 'Fine.', ds: 'D.S.', dc: 'D.C.' } as Record<string, string>)[nav] ?? nav, x, y, nav === 'fine' ? style.fine : style.navigation, 'repeat-mark-text'))))
      }
      if (document.hasBass) {
        const first = models[0]!
        const top = first.staves[0]!.y + staffMusicSize(), bottom = first.staves[1]!.y + (staffMusicSize() * 2)
        const brace = [staffGlyph('brace', 0, 0, style.music / scale)]
        brace[0]!.attributes.transform = `translate(${(staffMusicSize() / 4 * -1.2)} ${bottom}) scale(2.8 ${(bottom - top) / (staffMusicSize() / 4 * 4)})`
        node.children.push(element('g', { class: 'grpSym' }, brace))
      }
      // Endings retain their range identity over system and page boundaries.
      let index = 0
      while (index < line.measures.length) {
        const member = line.measures[index]!, ending = member.measure.source.ending
        if (!ending) { index++; continue }
        const start = index
        while (index < line.measures.length && line.measures[index]!.measure.source.ending === ending) index++
        const left = start === 0 ? models[start]!.staves[0]!.noteStartX : models[start]!.staves[0]!.x + engine.endingBarInset, right = models[index - 1]!.staves[0]!.x + models[index - 1]!.staves[0]!.width - engine.endingBarInset
        const originalId = member.measure.id.replace(/-fragment-\d+$/, '')
        const range = endingRanges.get(originalId)!
        const first = range.start === originalId && (!member.measure.fragment || member.measure.id.endsWith('-fragment-1'))
        const cls = `ending voltaBracket id-m3n-ending-${range.index}`
        node.children.push(element('g', { class: cls }, [
          ...(first ? [element('path', { class: 'm3n-ending-start-hook', d: `M${left} ${(staffMusicSize() / 4 * 1.7)} V${(staffMusicSize() / 4 * 0.5)}`, stroke: '#000', 'stroke-width': String((staffMusicSize() / 4 * 0.1)), fill: 'none' })] : []),
          element('path', { d: `M${left} ${(staffMusicSize() / 4 * 0.5)} H${right}`, stroke: '#000', 'stroke-width': String((staffMusicSize() / 4 * 0.1)), fill: 'none' }),
          element('path', { d: `M${right} ${(staffMusicSize() / 4 * 0.5)} V${(staffMusicSize() / 4 * 1.7)}`, stroke: '#000', 'stroke-width': String((staffMusicSize() / 4 * 0.1)), fill: 'none' }),
          ...nodes(text(first ? `${ending}.` : '', left + engine.endingTextInset, engine.endingTextY, style.voltaLabel, 'ending')),
        ]))
      }
      for (const tie of ties) {
        const first = anchors.get(tie.start.id), last = anchors.get(tie.end.id)
        if (!first && !last) continue
        const a = first?.last, b = last?.first
        ;(first?.staff ?? last!.staff).children.push(element('g', { class: 'tie' }, drawStaffTie(a, b, models[0]!.staves[0]!.noteStartX, line.target - inset - engine.endingBarInset)))
      }
      const slurMusic: Array<Ink[] | undefined> = []
      for (const { interval, start, end } of intervals) {
        const from = lineOf.get(start.id)!, to = lineOf.get(end.id)!
        if (lineIndex < from || lineIndex > to) continue
        const a = anchors.get(start.id), b = anchors.get(end.id)
        const lane = interval.staff === 'bass' ? 1 : 0
        const left = a?.first.headLeft ?? models[0]!.start + (staffMusicSize() / 4 * 0.2)
        const right = b?.last.headRight ?? (line.target - inset - engine.endingBarInset)
        const yTop = (models[0]!.staves[lane]?.y ?? 0) + staffMusicSize()
        const low = (models[0]!.staves[lane]?.y ?? 0) + (staffMusicSize() * 2)
        if (interval.kind === 'lg') {
          const music = slurMusic[lane] ??= new SvgGeometry(node, measureText, true).pieces(element('g', {}, nodes(node).filter(n => hasClass(n, 'measure')).flatMap(m => {
            const staff = nodes(m).filter(n => hasClass(n, 'staff'))[lane]
            return staff ? [element('g', staff.attributes, nodes(staff).filter(n => !hasClass(n, 'verse')))] : []
          })))
          const slur = staffSlur(left, right, yTop, music.filter(p => p.left < right && p.right > left))
          slur.attributes['data-m3n-staff'] = String(lane)
          node.children.push(slur)
        } else if (interval.kind === 'cresc' || interval.kind === 'decres') {
          if (interval.display === 'text') node.children.push(text(interval.kind === 'cresc' ? 'cresc.' : 'dim.', left, low + engine.expressionBottomGap, style.expression, 'dynam', { 'data-m3n-staff': String(lane) }))
          else {
            const y = low + (staffMusicSize() / 4 * 2.5), cresc = interval.kind === 'cresc', endX = Math.max(left + (staffMusicSize() / 4 * 0.4), right)
            const parent = a?.measure ?? nodes(node).find(n => hasClass(n, 'measure'))!
            parent.children.push(element('g', { class: 'hairpin', 'data-m3n-staff': String(lane) }, [element('path', { d: cresc ? `M${endX} ${y - (staffMusicSize() / 4 * 0.5)} L${left} ${y} L${endX} ${y + (staffMusicSize() / 4 * 0.5)}` : `M${left} ${y - (staffMusicSize() / 4 * 0.5)} L${endX} ${y} L${left} ${y + (staffMusicSize() / 4 * 0.5)}`, stroke: '#000', 'stroke-width': String((staffMusicSize() / 4 * 0.1)), fill: 'none' })]))
          }
        } else if (interval.kind === '8va' || interval.kind === '8vb') {
          const y = interval.kind === '8va' ? yTop - engine.octaveAboveGap : low + engine.octaveBelowGap
          node.children.push(element('g', { class: 'octave', 'data-m3n-staff': String(lane), 'data-m3n-below': String(interval.kind === '8vb') }, [
            ...(a ? nodes(text(interval.kind, left, y, style.octave, 'octave')) : []),
            element('path', { d: `M${left + (a ? engine.octaveTextWidth : 0)} ${y - (staffMusicSize() / 4 * 0.4)} H${right} v${(interval.kind === '8va' ? 1 : -1) * (staffMusicSize() / 4 * 0.8)}`, stroke: '#000', 'stroke-width': String((staffMusicSize() / 4 * 0.1)), 'stroke-dasharray': `${(staffMusicSize() / 4 * 0.4)} ${(staffMusicSize() / 4 * 0.3)}`, fill: 'none' }),
          ]))
        } else if ((interval.kind === 'rit' || interval.kind === 'accel') && a) node.children.push(text(`${interval.kind}.`, left, yTop - engine.expressionTopGap, style.expression, 'dir', { 'font-style': 'italic' }))
      }
      const headings = new Set(line.measures.filter(m => {
        const e = m.measure.melody[0]?.event
        return e?.sectionLabelBreakAfter || (e?.sectionLabel && measureText(e.sectionLabel, style.annotation, true).width + style.sectionLabelInset > width / 2)
      }).map(m => m.id))
      const geometry = new SvgGeometry(node, measureText, true)
      const system = arrangeStaffSystem(node, geometry, width, headings)
      if (system.staffSpacing > 0.01) { bassY += system.staffSpacing + engine.bassAdjustmentGap; continue }
      return system
    }
    throw new Error('五线谱歌词与低音谱表的净空无法稳定。')
  })
}
