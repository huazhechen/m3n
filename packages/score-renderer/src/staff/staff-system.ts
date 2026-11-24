import { Glyph, StaveConnector, StaveTie, type StaveNote } from 'vexflow/bravura'
import { SCORE_TEXT_FONT } from '@m3n/numbered-notation'
import { displayedTempo, numberedHeadingLines } from '@m3n/notation'
import { createStaffContext, createVexMeasure, drawVexMeasure, STAFF_SCALE, type VexMeasure } from './vexflow-engine.js'
import type { StaffDocument, StaffEvent } from './staff-document.js'
import type { StaffLine } from './line-layout.js'
import { arrangeStaffSystem } from './system-layout.js'
import { element, nodes, readXml, hasClass, SvgGeometry, type XmlNode, type MeasureText } from './layout-svg.js'

export function engraveStaffSystems(document: StaffDocument, lines: StaffLine[], width: number, measureText: MeasureText, spacing: number, measureNumbers: boolean, tempoScale = 1) {
  const scale = STAFF_SCALE, rawWidth = width / scale
  const text = (value: string, x: number, y: number, size: number, cls: string, attrs: Record<string, string> = {}) => element('g', { class: cls }, [element('text', { x: String(x), y: String(y), 'font-size': String(size / scale), 'font-family': SCORE_TEXT_FONT, ...attrs }, [value])])
  const wrap = (value: string, x: number, y: number, cls: string, bold = false) => {
    const rows = numberedHeadingLines(value, rawWidth - 12 / scale, 16 / scale, { measureText: (s: string, style: { fontSize: number }) => ({ w: measureText(s, style.fontSize, bold).width }) }, bold ? 700 : 400)
    return element('g', { class: cls }, rows.map((s, i) => nodes(text(s, x, y + i * 20 / scale, 16, cls, bold ? { 'font-weight': 'bold' } : {}))[0]!))
  }
  const allEvents = document.measures.flatMap(m => [m.melody, m.bass].flat())
  const lineOf = new Map<string, number>()
  lines.forEach((line, i) => line.measures.forEach(m => [m.measure.melody, m.measure.bass].flat().forEach(e => { lineOf.set(e.id, i); e.children?.forEach(child => lineOf.set(child.id, i)) })))
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
  return lines.map((line, lineIndex) => {
    let bassY = 130
    for (let pass = 0; pass < 8; pass++) {
      const context = createStaffContext()
      const capture = (draw: () => void) => {
        const g = context.openGroup(); draw(); context.closeGroup()
        const output = nodes(readXml(g.outerHTML))
        const normalize = (n: XmlNode) => {
          if (n.attributes.id?.startsWith('vf-')) delete n.attributes.id
          if (n.attributes.class) n.attributes.class = n.attributes.class.replace(/vf-/g, '')
          if (n.tagName === 'path' && n.attributes.fill === 'none' && !n.attributes.stroke) { n.attributes.stroke = '#000'; n.attributes['stroke-width'] ??= '1' }
          n.children.filter((c): c is XmlNode => typeof c !== 'string').forEach(normalize)
        }
        output.forEach(normalize)
        return output
      }
      const addTempo = (qpm: number, meterCount: number, meterUnit: number, tempoX: number, parent: XmlNode) => {
          const display = displayedTempo(qpm, meterCount, meterUnit)
          const tempo = element('g', { class: 'tempo' })
          const codes: Record<number, string> = { 1: 'noteheadWhole', 2: 'noteheadHalf', 4: 'noteheadBlack', 8: 'noteheadBlack', 16: 'noteheadBlack' }
          const glyph = capture(() => Glyph.renderGlyph(context, tempoX, -30, 28, codes[display.unit] ?? 'noteheadBlack'))
          tempo.children.push(...glyph)
          if (display.unit !== 1) tempo.children.push(element('path', { d: `M${tempoX + 9} -31 v-24`, stroke: '#000', 'stroke-width': '1.3', fill: 'none' }))
          if (display.unit >= 8) {
            const flags: Record<number, string> = { 8: 'flag8thUp', 16: 'flag16thUp', 32: 'flag32ndUp', 64: 'flag64thUp' }
            tempo.children.push(...capture(() => Glyph.renderGlyph(context, tempoX + 9, -55, 28, flags[display.unit] ?? 'flag8thUp')))
          }
          if (display.dots) tempo.children.push(element('circle', { cx: String(tempoX + 16), cy: '-31', r: '1.8', fill: '#000' }))
          tempo.children.push(...nodes(text(`= ${Number(display.bpm.toFixed(2))}`, tempoX + (display.dots ? 25 : 18), -28, 15, 'tempo-text')))
          parent.children.push(tempo)
      }
      const node = element('g', { class: 'system' })
      const models: VexMeasure[] = []
      const anchors = new Map<string, { first: StaveNote; last: StaveNote; item: StaffEvent; measure: XmlNode; staff: XmlNode }>()
      const inset = line.measures[0]!.inset
      const total = line.target - inset
      let x = 0
      for (const [index, member] of line.measures.entries()) {
        const model = createVexMeasure(member.measure, index === 0, document.hasBass, measureText, spacing, bassY)
        const target = document.score.equalMeasures ? total / line.measures.length : member.body + (index ? 0 : member.head - inset) + (line.target - line.minimum) * member.weight / line.weight
        const measureNode = drawVexMeasure(model, target, x, context)
        models.push(model)
        node.children.push(measureNode)
        for (const [lane, entries] of model.entries.entries()) {
          const staff = nodes(measureNode).filter(n => hasClass(n, 'staff'))[lane]!
          for (const entry of entries) {
            const item = entry.item
            anchors.set(item.id, { first: entry.notes[0]!, last: entry.notes.at(-1)!, item, measure: measureNode, staff })
            entry.notes.forEach((note, i) => {
              const child = item.children?.[i] ?? item
              const cx = (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2
              if (item.children) anchors.set(child.id, { first: note, last: note, item: child, measure: measureNode, staff })
              for (const lyric of child.lyrics) {
                const attrs: Record<string, string> = { id: `${child.id}-v${lyric.verseIndex}`, class: `verse${lyric.passes && lyric.passes.size > 1 ? ` m3n-passes-${[...lyric.passes].join('-')}` : ''}` }
                attrs['data-m3n-id'] = child.id.replace(/-n\d+$/, '').replace(/-rend\d+$/, '')
                if (item.children) attrs['data-m3n-tuplet-slot'] = String(i)
                attrs['data-m3n-rendition'] = String(lyric.verseIndex)
                const performedPass = /-rend(\d+)/.exec(child.id)?.[1]
                if (performedPass) attrs['data-m3n-passes'] = performedPass
                else if (lyric.passes) attrs['data-m3n-passes'] = [...lyric.passes].join('-')
                if (lyric.kind === 'placeholder') { staff.children.push(element('g', attrs)); continue }
                const value = lyric.kind === 'extender' ? '_' : lyric.text.replaceAll('~', ' ')
                const syl = text(value, cx, model.staves[lane]!.getBottomLineY() + 30, 16, 'syl', { 'text-anchor': 'middle' })
                if (lyric.underlined && lyric.kind === 'text') {
                  const w = measureText(value, 16 / scale).width
                  syl.children.push(element('path', { d: `M${cx - w / 2} ${model.staves[lane]!.getBottomLineY() + 34} h${w}`, stroke: '#000', 'stroke-width': String(1 / scale), fill: 'none' }))
                }
                staff.children.push(element('g', attrs, [syl]))
              }
            })
            const cx = entry.notes[0]!.getNoteHeadBeginX()
            const top = Math.min(...entry.notes.flatMap(n => n.getYs())) - 40
            const event = item.event
            if (item.chord) measureNode.children.push(text(item.chord, cx, top, 14, 'harm'))
            if (event.text) measureNode.children.push(wrap(event.text, cx, top, 'dir'))
            if (event.sectionLabel) measureNode.children.push(wrap(event.sectionLabel, 6 / scale, top, 'reh', true))
            if (event.dynamic || event.prefix) measureNode.children.push(text(event.dynamic ?? event.prefix!, cx, Math.max(...entry.notes.flatMap(n => n.getYs())) + 35, 16, 'dynam', { 'font-style': 'italic' }))
            for (const p of event.postfixes) if (/^f[1-5]$/.test(p)) measureNode.children.push(text(p.slice(1), cx, top, 13, 'fing'))
            for (const nav of event.navigation) addNavigation(nav, cx, top, measureNode)
          }
        }
        for (const nav of member.measure.source.navigation ?? []) addNavigation(nav, x + target - 15, -10, measureNode)
        if (member.measure.showTempo) addTempo(member.measure.tempo, member.measure.meterCount, member.measure.meterUnit, x + model.start, measureNode)
        for (const [i, entry] of model.entries[0]!.entries()) {
          const previous = model.entries[0]![i - 1]?.item.event.tempo
          const event = entry.item.event
          if (i > 0 && event.tempo !== undefined && event.tempo !== previous)
            addTempo(event.tempo * tempoScale, event.meterCount ?? member.measure.meterCount, event.meterUnit ?? member.measure.meterUnit, entry.notes[0]!.getNoteHeadBeginX(), measureNode)
        }
        if (member.measure.source.multiRest || member.measure.source.interlude) {
          const cx = x + model.start + (target - model.endInset - model.start) / 2, cy = model.staves[0]!.getYForLine(2)
          const count = member.measure.source.interlude ? '' : String(member.measure.source.multiRest)
          const countY = model.staves[0]!.getYForLine(0) - 0.5 - 2 / scale - measureText(count, 16 / scale, true).descent
          measureNode.children.push(element('g', { class: 'rest multi-rest' + (member.measure.source.interlude ? ' interlude' : ''), ...(member.measure.source.interlude ? { 'data-m3n-role': 'interlude' } : {}) }, [element('path', { d: `M${cx - 20} ${cy} h40 M${cx - 20} ${cy - 8} v16 M${cx + 20} ${cy - 8} v16`, stroke: '#000', 'stroke-width': '3', fill: 'none' }), ...(count ? nodes(text(count, cx, countY, 16, 'rest', { 'text-anchor': 'middle', 'font-weight': 'bold' })) : [])]))
        }
        // One spanning barline, redrawn after the final bass/lyric spacing pass.
        const y1 = model.staves[0]!.getYForLine(0), y2 = model.staves.at(-1)!.getYForLine(4)
        if (member.measure.source.right !== 'invis') measureNode.children.push(element('g', { class: 'barLine' }, [element('path', { d: `M${x + target} ${y1} V${y2}`, stroke: '#000', 'stroke-width': '1', fill: 'none' })]))
        if (measureNumbers && !member.measure.source.interlude && index === line.measures.length - 1) measureNode.children.push(text(String(member.measure.number), x + target, y1 - 10, 12, 'mNum', { 'text-anchor': 'end' }))
        x += target
      }
      function addNavigation(nav: string, x: number, y: number, parent: XmlNode) {
        const glyph = nav === 'segno' || nav === 'coda' ? capture(() => Glyph.renderGlyph(context, x, y, 30, nav)) : []
        parent.children.push(element('g', { class: 'repeatMark' }, glyph.length ? glyph : nodes(text(({ tocoda: 'To Coda', fine: 'Fine', ds: 'D.S.', dc: 'D.C.' } as Record<string, string>)[nav] ?? nav, x, y, 14, 'repeat-mark-text'))))
      }
      if (document.hasBass) {
        const first = models[0]!
        const brace = capture(() => new StaveConnector(first.staves[0]!, first.staves[1]!).setType('brace').setContext(context).draw())
        node.children.push(element('g', { class: 'grpSym' }, brace))
      }
      // Endings retain their range identity over system and page boundaries.
      let index = 0
      while (index < line.measures.length) {
        const member = line.measures[index]!, ending = member.measure.source.ending
        if (!ending) { index++; continue }
        const start = index
        while (index < line.measures.length && line.measures[index]!.measure.source.ending === ending) index++
        const left = start === 0 ? models[start]!.staves[0]!.getNoteStartX() : models[start]!.staves[0]!.getX() + 3, right = models[index - 1]!.staves[0]!.getX() + models[index - 1]!.staves[0]!.getWidth() - 3
        const original = document.measures.find(m => m.source.ending === ending && m.number <= member.measure.number)
        const first = original?.number === member.measure.number && !member.measure.id.includes('-fragment-2')
        const globalEndings = [...new Set(document.measures.map(m => m.source.ending).filter(Boolean))]
        const cls = `ending voltaBracket id-m3n-ending-${globalEndings.indexOf(ending) + 1}`
        node.children.push(element('g', { class: cls }, [
          ...(first ? [element('path', { class: 'm3n-ending-start-hook', d: `M${left} 17 V5`, stroke: '#000', 'stroke-width': '1', fill: 'none' })] : []),
          element('path', { d: `M${left} 5 H${right}`, stroke: '#000', 'stroke-width': '1', fill: 'none' }),
          element('path', { d: `M${right} 5 V17`, stroke: '#000', 'stroke-width': '1', fill: 'none' }),
          ...nodes(text(first ? `${ending}.` : '', left + 4, 22, 12, 'ending')),
        ]))
      }
      for (const tie of ties) {
        const first = anchors.get(tie.start.id), last = anchors.get(tie.end.id)
        if (!first && !last) continue
        const a = first?.last, b = last?.first
        const count = Math.min(a?.keys.length ?? Infinity, b?.keys.length ?? Infinity)
        const indices = Array.from({ length: Number.isFinite(count) ? count : 1 }, (_, i) => i)
        ;(first?.staff ?? last!.staff).children.push(element('g', { class: 'tie' }, capture(() => new StaveTie({ first_note: a, last_note: b, first_indices: indices, last_indices: indices }).setContext(context).draw())))
      }
      for (const { interval, start, end } of intervals) {
        const from = lineOf.get(start.id)!, to = lineOf.get(end.id)!
        if (lineIndex < from || lineIndex > to) continue
        const a = anchors.get(start.id), b = anchors.get(end.id)
        const lane = interval.staff === 'bass' ? 1 : 0
        const left = a?.first.getNoteHeadBeginX() ?? models[0]!.start + 2
        const right = b?.last.getNoteHeadEndX() ?? (line.target - inset - 3)
        const yTop = models[0]!.staves[lane]?.getYForLine(0) ?? 40
        const low = models[0]!.staves[lane]?.getYForLine(4) ?? 80
        if (interval.kind === 'lg') {
          const music = new SvgGeometry(node, measureText).pieces(element('g', {}, nodes(node).filter(n => hasClass(n, 'measure')).flatMap(m => {
            const staff = nodes(m).filter(n => hasClass(n, 'staff'))[lane]
            return staff ? [element('g', staff.attributes, nodes(staff).filter(n => !hasClass(n, 'verse')))] : []
          })))
          const obstacles = music.filter(p => p.left < right && p.right > left)
          const height = 14, y = Math.min(yTop - 15, ...obstacles.map(p => p.top - 6 / scale))
          node.children.push(element('g', { class: 'slur' }, [element('path', { d: `M${left} ${y} C${left + (right - left) / 3} ${y - height} ${right - (right - left) / 3} ${y - height} ${right} ${y} C${right - (right - left) / 3} ${y - height + 2} ${left + (right - left) / 3} ${y - height + 2} ${left} ${y} Z`, fill: '#000' })]))
        } else if (interval.kind === 'cresc' || interval.kind === 'decres') {
          if (interval.display === 'text') node.children.push(text(interval.kind === 'cresc' ? 'cresc.' : 'dim.', left, low + 30, 14, 'dynam'))
          else {
            const y = low + 25, cresc = interval.kind === 'cresc', endX = Math.max(left + 4, right)
            const parent = a?.measure ?? nodes(node).find(n => hasClass(n, 'measure'))!
            parent.children.push(element('g', { class: 'hairpin' }, [element('path', { d: cresc ? `M${endX} ${y - 5} L${left} ${y} L${endX} ${y + 5}` : `M${left} ${y - 5} L${endX} ${y} L${left} ${y + 5}`, stroke: '#000', 'stroke-width': '1', fill: 'none' })]))
          }
        } else if (interval.kind === '8va' || interval.kind === '8vb') {
          const y = interval.kind === '8va' ? yTop - 40 : low + 35
          node.children.push(element('g', { class: 'octave', 'data-m3n-below': String(interval.kind === '8vb') }, [
            ...(a ? nodes(text(interval.kind, left, y, 13, 'octave')) : []),
            element('path', { d: `M${left + (a ? 25 : 0)} ${y - 4} H${right} v${interval.kind === '8va' ? 8 : -8}`, stroke: '#000', 'stroke-width': '1', 'stroke-dasharray': '4 3', fill: 'none' }),
          ]))
        } else if ((interval.kind === 'rit' || interval.kind === 'accel') && a) node.children.push(text(`${interval.kind}.`, left, yTop - 25, 14, 'dir', { 'font-style': 'italic' }))
      }
      const headings = new Set(line.measures.filter(m => {
        const e = m.measure.melody[0]?.event
        return e?.sectionLabelBreakAfter || (e?.sectionLabel && measureText(e.sectionLabel, 16, true).width + 21 > width / 2)
      }).map(m => m.id))
      const geometry = new SvgGeometry(node, measureText)
      const system = arrangeStaffSystem(node, geometry, width, headings)
      if (system.staffSpacing > 0.01) { bassY += system.staffSpacing + 5; continue }
      return system
    }
    throw new Error('五线谱歌词与低音谱表的净空无法稳定。')
  })
}
