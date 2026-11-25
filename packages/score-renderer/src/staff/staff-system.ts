import { SCORE_TEXT_FONT, scoreLayoutConfig } from '@m3n/numbered-notation'
import { displayedTempo, numberedHeadingLines } from '@m3n/notation'
import { createStaffMeasure, drawStaffMeasure, drawStaffTie, STAFF_SCALE, type StaffMeasureLayout, type StaffPreparation, type StaffNoteAnchor } from './staff-engine.js'
import { staffGlyph, type StaffGlyph } from './staff-music-font.js'
import type { StaffDocument, StaffEvent } from './staff-document.js'
import type { StaffLine } from './line-layout.js'
import { staffLyricDrawing } from './staff-lyric-drawing.js'
import { arrangeStaffSystem } from './system-layout.js'
import { element, nodes, hasClass, SvgGeometry, type XmlNode, type Ink, type MeasureText } from './layout-svg.js'

const style = scoreLayoutConfig.staff

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
  const text = (value: string, x: number, y: number, size: number, cls: string, attrs: Record<string, string> = {}) => element('g', { class: cls }, [element('text', { x: String(x), y: String(y), 'font-size': String(size / scale), 'font-family': SCORE_TEXT_FONT, ...attrs }, [value])])
  const wrap = (value: string, x: number, y: number, cls: string, bold = false) => {
    const rows = numberedHeadingLines(value, rawWidth - 12 / scale, style.annotation / scale, { measureText: (s: string, style: { fontSize: number }) => ({ w: measureText(s, style.fontSize, bold).width }) }, bold ? 700 : 400)
    return element('g', { class: cls }, rows.map((s, i) => nodes(text(s, x, y + i * style.annotationLineHeight / scale, style.annotation, cls, bold ? { 'font-weight': 'bold' } : {}))[0]!))
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
    let bassY = 130
    for (let pass = 0; pass < 8; pass++) {
      const addTempo = (qpm: number, meterCount: number, meterUnit: number, tempoX: number, parent: XmlNode) => {
          const display = displayedTempo(qpm, meterCount, meterUnit)
          const tempo = element('g', { class: 'tempo' })
          const codes: Record<number, string> = { 1: 'noteheadWhole', 2: 'noteheadHalf', 4: 'noteheadBlack', 8: 'noteheadBlack', 16: 'noteheadBlack' }
          const glyph = [staffGlyph((codes[display.unit] ?? 'noteheadBlack') as StaffGlyph, tempoX, -30, 32)]
          tempo.children.push(...glyph)
          if (display.unit !== 1) tempo.children.push(element('path', { d: `M${tempoX + 9} -31 v-24`, stroke: '#000', 'stroke-width': '1.3', fill: 'none' }))
          if (display.unit >= 8) {
            const flags: Record<number, string> = { 8: 'flag8Up', 16: 'flag16Up', 32: 'flag32Up', 64: 'flag64Up' }
            tempo.children.push(staffGlyph((flags[display.unit] ?? 'flag8Up') as StaffGlyph, tempoX + 9, -55, 32))
          }
          if (display.dots) tempo.children.push(element('circle', { cx: String(tempoX + 16), cy: '-31', r: '1.8', fill: '#000' }))
          tempo.children.push(...nodes(text(`= ${Number(display.bpm.toFixed(2))}`, tempoX + (display.dots ? 25 : 18), -28, style.tempo, 'tempo-text')))
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
        const target = document.score.equalMeasures ? total / line.measures.length : member.body + (index ? 0 : member.head - inset) + (line.target - line.minimum) * member.weight / line.weight
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
                const syl = staffLyricDrawing(value, cx, (model.staves[lane]!.y + 80) + 30, Boolean(lyric.underlined && lyric.kind === 'text'), measureText, preparation?.lyricTexts)
                staff.children.push(element('g', attrs, [syl]))
              }
            })
            const event = item.event
            if (!(item.chord || event.text || event.sectionLabel || event.dynamic || event.prefix || event.navigation.length ||
              event.postfixes.some(value => /^f[1-5]$/.test(value)))) continue
            const cx = entry.notes[0]!.headLeft
            const top = Math.min(...entry.notes.flatMap(n => n.ys)) - 40
            if (item.chord) measureNode.children.push(text(item.chord, cx, top, style.chord, 'harm'))
            if (event.text) measureNode.children.push(wrap(event.text, cx, top, 'dir'))
            if (event.sectionLabel) measureNode.children.push(wrap(event.sectionLabel, 6 / scale, top, 'reh', true))
            if (event.dynamic || event.prefix) measureNode.children.push(text(event.dynamic ?? event.prefix!, cx, Math.max(...entry.notes.flatMap(n => n.ys)) + 35, style.dynamic, 'dynam', { 'font-style': 'italic' }))
            for (const p of event.postfixes) if (/^f[1-5]$/.test(p)) measureNode.children.push(text(p.slice(1), cx, top, style.fingering, 'fing'))
            for (const nav of event.navigation) addNavigation(nav, cx, top, measureNode)
          }
        }
        for (const nav of member.measure.source.navigation ?? []) addNavigation(nav, x + target - 15, -10, measureNode)
        if (member.measure.showTempo) addTempo(member.measure.tempo, member.measure.meterCount, member.measure.meterUnit, x + model.start, measureNode)
        for (const [i, entry] of model.entries[0]!.entries()) {
          const previous = model.entries[0]![i - 1]?.item.event.tempo
          const event = entry.item.event
          if (i > 0 && event.tempo !== undefined && event.tempo !== previous)
            addTempo(event.tempo * tempoScale, event.meterCount ?? member.measure.meterCount, event.meterUnit ?? member.measure.meterUnit, entry.notes[0]!.headLeft, measureNode)
        }
        if (member.measure.source.multiRest || member.measure.source.interlude) {
          const cx = x + model.start + (target - model.endInset - model.start) / 2, cy = (model.staves[0]!.y + 60)
          const count = member.measure.source.interlude ? '' : String(member.measure.source.multiRest)
          const countY = model.staves[0]!.y + 40 - 0.5 - 2 / scale - measureText(count, style.restCount / scale, true).descent
          measureNode.children.push(element('g', { class: 'rest multi-rest' + (member.measure.source.interlude ? ' interlude' : ''), ...(member.measure.source.interlude ? { 'data-m3n-role': 'interlude' } : {}) }, [element('path', { d: `M${cx - 20} ${cy} h40 M${cx - 20} ${cy - 8} v16 M${cx + 20} ${cy - 8} v16`, stroke: '#000', 'stroke-width': '3', fill: 'none' }), ...(count ? nodes(text(count, cx, countY, style.restCount, 'rest', { 'text-anchor': 'middle', 'font-weight': 'bold' })) : [])]))
        }
        // One spanning barline, redrawn after the final bass/lyric spacing pass.
        const y1 = (model.staves[0]!.y + 40), y2 = (model.staves.at(-1)!.y + 80)
        if (member.measure.source.right !== 'invis') measureNode.children.push(element('g', { class: 'barLine' }, [element('path', { d: `M${x + target} ${y1} V${y2}`, stroke: '#000', 'stroke-width': '1', fill: 'none' })]))
        if (measureNumbers && !member.measure.source.interlude && index === line.measures.length - 1) measureNode.children.push(text(String(member.measure.number), x + target, y1 - 10, style.measureNumber, 'mNum', { 'text-anchor': 'end' }))
        x += target
      }
      function addNavigation(nav: string, x: number, y: number, parent: XmlNode) {
        const glyph = nav === 'segno' || nav === 'coda' ? [staffGlyph(nav, x, y)] : []
        parent.children.push(element('g', { class: 'repeatMark' }, glyph.length ? glyph : nodes(text(({ tocoda: 'To Coda', fine: 'Fine', ds: 'D.S.', dc: 'D.C.' } as Record<string, string>)[nav] ?? nav, x, y, style.navigation, 'repeat-mark-text'))))
      }
      if (document.hasBass) {
        const first = models[0]!
        const top = first.staves[0]!.y + 40, bottom = first.staves[1]!.y + 80
        const brace = [staffGlyph('brace', 0, 0, 40)]
        brace[0]!.attributes.transform = `translate(-12 ${bottom}) scale(2.8 ${(bottom - top) / 39.88})`
        node.children.push(element('g', { class: 'grpSym' }, brace))
      }
      // Endings retain their range identity over system and page boundaries.
      let index = 0
      while (index < line.measures.length) {
        const member = line.measures[index]!, ending = member.measure.source.ending
        if (!ending) { index++; continue }
        const start = index
        while (index < line.measures.length && line.measures[index]!.measure.source.ending === ending) index++
        const left = start === 0 ? models[start]!.staves[0]!.noteStartX : models[start]!.staves[0]!.x + 3, right = models[index - 1]!.staves[0]!.x + models[index - 1]!.staves[0]!.width - 3
        const originalId = member.measure.id.replace(/-fragment-\d+$/, '')
        const range = endingRanges.get(originalId)!
        const first = range.start === originalId && (!member.measure.fragment || member.measure.id.endsWith('-fragment-1'))
        const cls = `ending voltaBracket id-m3n-ending-${range.index}`
        node.children.push(element('g', { class: cls }, [
          ...(first ? [element('path', { class: 'm3n-ending-start-hook', d: `M${left} 17 V5`, stroke: '#000', 'stroke-width': '1', fill: 'none' })] : []),
          element('path', { d: `M${left} 5 H${right}`, stroke: '#000', 'stroke-width': '1', fill: 'none' }),
          element('path', { d: `M${right} 5 V17`, stroke: '#000', 'stroke-width': '1', fill: 'none' }),
          ...nodes(text(first ? `${ending}.` : '', left + 4, 22, style.volta, 'ending')),
        ]))
      }
      for (const tie of ties) {
        const first = anchors.get(tie.start.id), last = anchors.get(tie.end.id)
        if (!first && !last) continue
        const a = first?.last, b = last?.first
        ;(first?.staff ?? last!.staff).children.push(element('g', { class: 'tie' }, drawStaffTie(a, b, models[0]!.staves[0]!.noteStartX, line.target - inset - 3)))
      }
      const slurMusic: Array<Ink[] | undefined> = []
      for (const { interval, start, end } of intervals) {
        const from = lineOf.get(start.id)!, to = lineOf.get(end.id)!
        if (lineIndex < from || lineIndex > to) continue
        const a = anchors.get(start.id), b = anchors.get(end.id)
        const lane = interval.staff === 'bass' ? 1 : 0
        const left = a?.first.headLeft ?? models[0]!.start + 2
        const right = b?.last.headRight ?? (line.target - inset - 3)
        const yTop = (models[0]!.staves[lane]?.y ?? 0) + 40
        const low = (models[0]!.staves[lane]?.y ?? 0) + 80
        if (interval.kind === 'lg') {
          const music = slurMusic[lane] ??= new SvgGeometry(node, measureText, true).pieces(element('g', {}, nodes(node).filter(n => hasClass(n, 'measure')).flatMap(m => {
            const staff = nodes(m).filter(n => hasClass(n, 'staff'))[lane]
            return staff ? [element('g', staff.attributes, nodes(staff).filter(n => !hasClass(n, 'verse')))] : []
          })))
          const obstacles = music.filter(p => p.left < right && p.right > left)
          const height = 14, y = Math.min(yTop - 15, ...obstacles.map(p => p.top - 6 / scale))
          const path = element('path', { d: `M${left} ${y} C${left + (right - left) / 3} ${y - height} ${right - (right - left) / 3} ${y - height} ${right} ${y} C${right - (right - left) / 3} ${y - height + 2} ${left + (right - left) / 3} ${y - height + 2} ${left} ${y} Z`, fill: '#000' })
          // The controls divide x evenly, so x is linear in t and the two
          // edges are y - 3*h*t*(1-t). Bound short slices exactly; a volta
          // number near an endpoint must not avoid the curve's distant peak.
          const count = Math.max(1, Math.ceil(Math.abs(right - left) / 4))
          const boxes = Array.from({ length: count }, (_, i) => {
            const a = i / count, b = (i + 1) / count
            const peak = Math.max(a, Math.min(b, 0.5))
            return { left: left + (right - left) * a, right: left + (right - left) * b,
              top: y - 3 * height * peak * (1 - peak),
              bottom: y - 3 * (height - 2) * Math.min(a * (1 - a), b * (1 - b)) }
          })
          path.pathInk = { d: path.attributes.d!, boxes }
          node.children.push(element('g', { class: 'slur' }, [path]))
        } else if (interval.kind === 'cresc' || interval.kind === 'decres') {
          if (interval.display === 'text') node.children.push(text(interval.kind === 'cresc' ? 'cresc.' : 'dim.', left, low + 30, style.expression, 'dynam'))
          else {
            const y = low + 25, cresc = interval.kind === 'cresc', endX = Math.max(left + 4, right)
            const parent = a?.measure ?? nodes(node).find(n => hasClass(n, 'measure'))!
            parent.children.push(element('g', { class: 'hairpin' }, [element('path', { d: cresc ? `M${endX} ${y - 5} L${left} ${y} L${endX} ${y + 5}` : `M${left} ${y - 5} L${endX} ${y} L${left} ${y + 5}`, stroke: '#000', 'stroke-width': '1', fill: 'none' })]))
          }
        } else if (interval.kind === '8va' || interval.kind === '8vb') {
          const y = interval.kind === '8va' ? yTop - 40 : low + 35
          node.children.push(element('g', { class: 'octave', 'data-m3n-below': String(interval.kind === '8vb') }, [
            ...(a ? nodes(text(interval.kind, left, y, style.octave, 'octave')) : []),
            element('path', { d: `M${left + (a ? 25 : 0)} ${y - 4} H${right} v${interval.kind === '8va' ? 8 : -8}`, stroke: '#000', 'stroke-width': '1', 'stroke-dasharray': '4 3', fill: 'none' }),
          ]))
        } else if ((interval.kind === 'rit' || interval.kind === 'accel') && a) node.children.push(text(`${interval.kind}.`, left, yTop - 25, style.expression, 'dir', { 'font-style': 'italic' }))
      }
      const headings = new Set(line.measures.filter(m => {
        const e = m.measure.melody[0]?.event
        return e?.sectionLabelBreakAfter || (e?.sectionLabel && measureText(e.sectionLabel, style.annotation, true).width + 21 > width / 2)
      }).map(m => m.id))
      const geometry = new SvgGeometry(node, measureText, true)
      const system = arrangeStaffSystem(node, geometry, width, headings)
      if (system.staffSpacing > 0.01) { bassY += system.staffSpacing + 5; continue }
      return system
    }
    throw new Error('五线谱歌词与低音谱表的净空无法稳定。')
  })
}
