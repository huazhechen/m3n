import type { StaffSystem } from './system-layout.js'
import { staffSystemLowerBound } from './staff-system-lower-bound.js'
import type { ScorePageBlock } from '@m3n/numbered-notation/layout'
import { staffTempoBeat } from './staff-tempo.js'
import { staffSlur } from './staff-slur.js'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { SCORE_TEXT_FONT, scoreDynamicGlyph, lyricSpacing, hasLyricHyphen, connectsLyricWord, lyricHyphenGeometry } from '@m3n/numbered-notation'
import { displayedTempo, numberedHeadingLines } from '@m3n/notation'
import { createStaffPreparation, createStaffMeasure, borrowStaffMeasure, drawStaffMeasure, drawStaffTie, STAFF_SCALE, type StaffMeasureLayout, type StaffPreparation, type StaffNoteAnchor } from './staff-engine.js'
import { staffMusicSize, staffGlyph, staffGlyphMetrics, staffNavigationGlyph } from './staff-music-font.js'
import type { StaffDocument, StaffEvent } from './staff-document.js'
import type { StaffLine } from './line-layout.js'
import { staffLyricDrawing } from './staff-lyric-drawing.js'
import { arrangeStaffSystem, placeStaffTuplets } from './system-layout.js'
import { element, nodes, findAll, readXml, hasClass, SvgGeometry, translate, type XmlNode, type Ink, type MeasureText } from './layout-svg.js'

const style = scoreLayoutConfig.staff
const engine = style.engine
const shared = scoreLayoutConfig.numbered

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
  preparation: StaffPreparation = createStaffPreparation(document), selectedLine?: number, endpointLine?: (id: string) => number | undefined, numericOnly = false, deferPieces = numericOnly): StaffSystem[] {
  const systems = buildStaffSystems(document,lines,width,measureText,spacing,measureNumbers,tempoScale,preparation,selectedLine,endpointLine,numericOnly,deferPieces,false) as StaffSystem[]
  return refineStaffBeamDirections(systems,document,lines,width,measureText,spacing,measureNumbers,tempoScale,preparation,selectedLine,endpointLine,numericOnly,deferPieces)
}
function refineStaffBeamDirections(systems: StaffSystem[], document: StaffDocument, lines: StaffLine[], width: number, measureText: MeasureText,
  spacing: number, measureNumbers: boolean, tempoScale: number, preparation: StaffPreparation, selectedLine: number|undefined,
  endpointLine: ((id: string) => number|undefined)|undefined, numericOnly: boolean, deferPieces: boolean): StaffSystem[] {
  if (!style.reuseBeamOuterSpace) return systems
  for (const [resultIndex, initial] of systems.entries()) {
    const index = selectedLine ?? resultIndex, line = lines[index]!
    let best = initial
    const originalHeight = initial.ink.bottom - initial.ink.top
    const lyricsByLane = ['melody', 'bass'].map(lane => line.measures.some(member =>
      member.measure[lane as 'melody' | 'bass'].some(entry => (entry.children ?? [entry])
        .some(note => note.lyrics.some(lyric => lyric.kind !== 'placeholder')))))
    let choices = new Map<string, number>()
    for (const [measureIndex, member] of line.measures.entries()) {
      const prepared = preparation.measure(member.measure, measureIndex === 0, document.hasBass, measureText)
      for (const beam of prepared.beams) {
        if (!beam.flexible) continue
        const note = prepared.entries[beam.lane]!.flatMap(entry => entry.notes)[beam.indices[0]!]!
        const trialChoices = new Map(choices).set(note.item.id, -note.direction)
        const trialPreparation = preparation.withBeamDirections(trialChoices, document)
        const plans = relationPlans.get(preparation)
        if (plans) relationPlans.set(trialPreparation, plans)
        const trial = (buildStaffSystems(document, lines, width, measureText, spacing, measureNumbers,
          tempoScale, trialPreparation, index, endpointLine, numericOnly, deferPieces, false) as StaffSystem[])[0]!
        // Compare complete, fully arranged ink, including lyrics and slurs.
        // Near ties prefer upward stems beside lyrics, within the original
        // row height ceiling. Musical size and attachment gaps never shrink.
        const height = trial.ink.bottom - trial.ink.top
        const difference = height - (best.ink.bottom - best.ink.top)
        const near = lyricsByLane[beam.lane] && Math.abs(difference) <= style.beamDirectionNearHeight / STAFF_SCALE
        if (near ? -note.direction === 1 && height <= originalHeight + 1e-7 : difference < -1e-7) {
          best = trial; choices = trialChoices
        }
      }
    }
    best.node.attributes['data-m3n-beam-flips'] = String(choices.size)
    systems[resultIndex] = best
  }
  return systems
}

export type PreparedStaffSystem = { lowerBound: ScorePageBlock; complete: () => StaffSystem }
/** Prepare music once. Exact completion resumes the same row and preserves
 * the original relation and attachment pipeline. */
export function prepareStaffSystems(document: StaffDocument, lines: StaffLine[], width: number, measureText: MeasureText, spacing: number,
  measureNumbers: boolean, tempoScale: number, preparation: StaffPreparation, endpointLine?: (id: string) => number | undefined): PreparedStaffSystem[] {
  if(document.hasBass)throw new Error('Directional staff bounds currently require a single staff')
  const rows = buildStaffSystems(document,lines,width,measureText,spacing,measureNumbers,tempoScale,preparation,undefined,endpointLine,true,false,true) as PreparedStaffSystem[]
  return rows.map((row,index) => {
    let completed: StaffSystem | undefined
    return {lowerBound:row.lowerBound,complete:() => completed ??= refineStaffBeamDirections([row.complete()],document,lines,width,measureText,spacing,
      measureNumbers,tempoScale,preparation,index,endpointLine,true,false)[0]!}
  })
}
function buildStaffSystems(document: StaffDocument, lines: StaffLine[], width: number, measureText: MeasureText, spacing: number, measureNumbers: boolean, tempoScale: number,
  preparation: StaffPreparation, selectedLine: number|undefined, endpointLine: ((id: string) => number | undefined)|undefined, numericOnly: boolean, deferPieces: boolean, lowerOnly: boolean) {
  const scale = STAFF_SCALE, rawWidth = width / scale, attachmentGap = preparation.attachmentGap
  const text = (value: string, x: number, y: number, size: number, cls: string, attrs: Record<string, string> = {}) => {
    const { 'data-m3n-staff': lane, ...textAttrs } = attrs
    return element('g', { class: cls, ...(lane === undefined ? {} : { 'data-m3n-staff': lane }) }, [
      element('text', { x: String(x), y: String(y), 'font-size': String(size / scale),
        'font-family': SCORE_TEXT_FONT, 'font-weight': String(scoreLayoutConfig.fonts.textWeight), ...textAttrs }, [value]),
    ])
  }
  const wrap = (value: string, x: number, y: number, cls: string, bold = false) => {
    const size = cls === 'tempo-direction' ? style.tempo : style.annotation
    const rows = numberedHeadingLines(value, rawWidth - style.attachmentWrapInset / scale, size / scale, { measureText: (s: string, style: { fontSize: number }) => ({ w: measureText(s, style.fontSize, bold).width }) }, bold ? scoreLayoutConfig.fonts.boldWeight : scoreLayoutConfig.fonts.regularWeight)
    return element('g', { class: cls }, rows.map((s, i) => nodes(text(s, x, y + i * size / scale, size, cls, bold ? { 'font-weight': String(scoreLayoutConfig.fonts.boldWeight) } : {}))[0]!))
  }
  let plans = preparation && relationPlans.get(preparation)
  if (preparation && !plans) { plans = new WeakMap(); relationPlans.set(preparation, plans) }
  let relations = plans?.get(document)
  if (!relations) { relations = prepareSystemRelations(document); plans?.set(document, relations) }
  const { intervals, ties, endpoints, intervalEndpoints, endingRanges } = relations
  const lineOf = new Map<string, number>()
  if (endpointLine) {
    for (const id of intervalEndpoints) {
      const index = endpointLine(id)
      if (index !== undefined) lineOf.set(id, index)
    }
  } else lines.forEach((line, i) => line.measures.forEach(m => {
    for (const lane of [m.measure.melody, m.measure.bass]) for (const e of lane) {
      if (intervalEndpoints.has(e.id)) lineOf.set(e.id, i)
      for (const child of e.children ?? []) if (intervalEndpoints.has(child.id)) lineOf.set(child.id, i)
    }
  }))
  return lines.map((line, lineIndex) => ({ line, lineIndex }))
    .filter(({ lineIndex }) => selectedLine === undefined || lineIndex === selectedLine)
    .map(({ line, lineIndex }) => {
    let bassY = engine.initialBassY
    for (let pass = 0; pass < 8; pass++) {
      const addTempo = (qpm: number, meterCount: number, meterUnit: number, tempoX: number, parent: XmlNode, direction?: string) => {
          const display = displayedTempo(qpm, meterCount, meterUnit)
          const tempo = element('g', { class: 'tempo' })
          const baseline = staffMusicSize() / 4 * -2.8
          const beat = staffTempoBeat(display.unit, display.dots, tempoX, baseline, style.tempo / scale, measureText)
          tempo.children.push(beat.node, ...nodes(text(`= ${Number(display.bpm.toFixed(2))}`, beat.textX, baseline, style.tempo, 'tempo-text')))
          if (direction) {
            const label = wrap(direction, tempoX, staffMusicSize() / 4 * -2.8, 'tempo-direction')
            const geometry = new SvgGeometry(element('g', {}, [label, tempo]), measureText)
            const a = geometry.ink(label), b = geometry.ink(tempo)
            const gap = style.tempo * .4 / scale
            // Text is the primary indication; the metronome mark supplements
            // it on the same baseline. Keep one movable collision envelope.
            if (a.right - a.left + gap + b.right - b.left <= rawWidth - style.attachmentWrapInset / scale) {
              translate(tempo, a.right + gap - b.left, 0)
            } else {
              translate(tempo, a.left - b.left, a.bottom + gap - b.top)
            }
            tempo.attributes.class = 'tempo-metronome'
            parent.children.push(element('g', { class: 'tempo' }, [label, tempo]))
          } else parent.children.push(tempo)
      }
      const node = element('g', { class: 'system' })
      const models: StaffMeasureLayout[] = []
      const lyricAnchors: Array<{ lyric: StaffEvent['lyrics'][number]; verse: XmlNode; lane: number; y: number; left: number; right: number }> = []
      const anchors = new Map<string, { first: StaffNoteAnchor; last: StaffNoteAnchor; item: StaffEvent; measure: XmlNode; staff: XmlNode }>()
      const inset = line.measures[0]!.inset
      const total = line.target - inset
      let x = 0
      for (const [index, member] of line.measures.entries()) {
        const model = (numericOnly && !lowerOnly ? borrowStaffMeasure : createStaffMeasure)(member.measure, index === 0, document.hasBass, measureText, spacing, bassY, preparation)
        const target = document.score.equalMeasures ? (total - (line.measures[0]!.head - inset)) / line.measures.length + (index ? 0 : member.head - inset) : member.body + (index ? 0 : member.head - inset) + (line.target - line.minimum) * member.weight / line.weight
        const next = line.measures[index + 1]?.measure
        const suppressEndRepeat = Boolean(next?.joinsPreviousRepeat ||
          next?.source.left?.startsWith('rpt'))
        const measureNode = drawStaffMeasure(model, target, x, suppressEndRepeat, numericOnly)
        models.push(model)
        node.children.push(measureNode)
        const melodyEntries = model.entries[0] ?? []
        const firstSoundingIndex = melodyEntries.findIndex(entry => entry.item.event.kind !== 'rest')
        // Initial rests defer a direction to the first sounding event in the
        // document. Keep its opening tempo caption together at the bar start.
        const openingDirectionIndex = member.measure.showTempo && firstSoundingIndex >= 0
          && melodyEntries[firstSoundingIndex]!.item.event.expression
          && melodyEntries.slice(0, firstSoundingIndex + 1).every(entry => entry.item.event.tempo === melodyEntries[0]!.item.event.tempo)
          ? firstSoundingIndex : -1
        for (const [lane, entries] of model.entries.entries()) {
          const staff = nodes(measureNode).filter(n => hasClass(n, 'staff'))[lane]!
          for (const [entryIndex, entry] of entries.entries()) {
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
                const verse = element('g', attrs, [syl])
                staff.children.push(verse)
                if (lyric.kind === 'text' && lyric.wordpos && value.trim()) {
                  const metrics = measureText(value, lyricSpacing.fontSize / scale)
                  const left = cx - metrics.width / 2
                  lyricAnchors.push({ lyric, verse, lane, y: model.staves[lane]!.y + staffMusicSize() * 2 + engine.lyricInitialOffset,
                    left: left + metrics.left, right: left + metrics.right })
                }
              }
            })
            const event = item.event
            if (!(item.chord || event.text || event.expression || event.sectionLabel || event.dynamic || event.prefix || event.navigation.length ||
              event.postfixes.some(value => /^f[1-5]$/.test(value)))) continue
            const cx = entry.notes[0]!.headLeft
            const top = Math.min(...entry.notes.flatMap(n => n.ys)) - engine.attachmentTopGap
            if (item.chord) measureNode.children.push(text(item.chord, cx, top, style.chord, 'harm'))
            const combinedTempo = lane === 0 && (entryIndex === openingDirectionIndex
              || entryIndex > 0 && event.tempo !== undefined && event.tempo !== entries[entryIndex - 1]!.item.event.tempo)
            if (event.text) measureNode.children.push(wrap(event.text, cx, top, 'dir'))
            if (event.expression && !combinedTempo) measureNode.children.push(wrap(event.expression, cx, top, 'dir'))
            if (event.sectionLabel) measureNode.children.push(wrap(event.sectionLabel, attachmentGap / scale, top, 'reh', true))
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
        if (member.measure.showTempo) addTempo(member.measure.tempo, member.measure.meterCount, member.measure.meterUnit, x + model.start, measureNode, melodyEntries[openingDirectionIndex]?.item.event.expression)
        for (const [i, entry] of model.entries[0]!.entries()) {
          const previous = model.entries[0]![i - 1]?.item.event.tempo
          const event = entry.item.event
          if (i > 0 && event.tempo !== undefined && event.tempo !== previous)
            addTempo(event.tempo * tempoScale, event.meterCount ?? member.measure.meterCount, event.meterUnit ?? member.measure.meterUnit, entry.notes[0]!.headLeft, measureNode, event.expression)
        }
        if (member.measure.source.multiRest || member.measure.source.interlude) {
          const cx = x + model.start + (target - model.endInset - model.start) / 2, cy = (model.staves[0]!.y + (staffMusicSize() * 1.5))
          const count = member.measure.source.interlude ? '' : String(member.measure.source.multiRest)
          const countY = model.staves[0]!.y + staffMusicSize() - (staffMusicSize() / 4 * 0.1) / 2 - attachmentGap / scale - measureText(count, style.restCount / scale, true).descent
          measureNode.children.push(element('g', { class: 'rest multi-rest' + (member.measure.source.interlude ? ' interlude' : ''), ...(member.measure.source.interlude ? { 'data-m3n-role': 'interlude' } : {}) }, [element('path', { d: `M${cx - (staffMusicSize() / 4 * 2)} ${cy} h${(staffMusicSize() / 4 * 2) * 2} M${cx - (staffMusicSize() / 4 * 2)} ${cy - (staffMusicSize() / 4 * 0.8)} v${(staffMusicSize() / 4 * 0.8) * 2} M${cx + (staffMusicSize() / 4 * 2)} ${cy - (staffMusicSize() / 4 * 0.8)} v${(staffMusicSize() / 4 * 0.8) * 2}`, stroke: '#000', 'stroke-width': String((staffMusicSize() / 4 * 0.3)), fill: 'none' }), ...(count ? nodes(text(count, cx, countY, style.restCount, 'rest', { 'text-anchor': 'middle', 'font-weight': String(scoreLayoutConfig.fonts.boldWeight) })) : [])]))
        }
        // Connect staves without repainting the bar inside each staff.
        const y1 = model.staves[0]!.y + staffMusicSize(), y2 = model.staves.at(-1)!.y + staffMusicSize() * 2
        const connectorTop = y1 + staffMusicSize(), connectorBottom = y2 - staffMusicSize()
        if (connectorBottom > connectorTop && member.measure.source.right !== 'invis' && !suppressEndRepeat) {
          // The continuation and both staff endpoints are one compound bar.
          // Repeat rules can be offset from the nominal bar x; retain their
          // actual identities so a painted endpoint join is not a collision.
          const endpointJoins = findAll(measureNode, n => hasClass(n, 'staff-bar'))
            .flatMap(bar => findAll(bar, n => Boolean(n.attributes['data-m3n-join'])))
            .map(rule => rule.attributes['data-m3n-join']!).join(' ')
          measureNode.children.push(element('g', { class: 'staff-bar' }, [element('path', {
            d: `M${x + target} ${connectorTop} V${connectorBottom}`, stroke: '#000',
            'stroke-width': String((staffMusicSize() / 4 * 0.1)), fill: 'none',
            // A tie may cross this continuation just as it crosses the bar
            // inside either staff. Preserve that same explicit join contract.
            'data-m3n-join': `bar-${x + target},${connectorTop} ${endpointJoins}`,
          })]))
        }
        if ((member.measure.source.repeatCount ?? 2) > 2) measureNode.children.push(text(`×${member.measure.source.repeatCount}`, x + target - engine.navigationBarInset, engine.navigationY, style.repeatCount, 'repeatMark'))
        if (measureNumbers && !member.measure.source.interlude && index === line.measures.length - 1) measureNode.children.push(text(String(member.measure.number), x + target, y1 - engine.measureNumberOffset, style.measureNumber, 'mNum', { 'text-anchor': 'end' }))
        x += target
      }
      function addNavigation(nav: string, x: number, y: number, parent: XmlNode) {
        const glyph = nav === 'segno' || nav === 'coda' ? [staffNavigationGlyph(nav, x, y)] : []
        parent.children.push(element('g', { class: 'repeatMark' }, glyph.length ? glyph : nodes(text(({ tocoda: 'To Coda', fine: 'Fine.', ds: 'D.S.', dc: 'D.C.' } as Record<string, string>)[nav] ?? nav, x, y, nav === 'fine' ? style.fine : style.navigation, 'repeat-mark-text'))))
      }
      const headings = new Set(line.measures.filter(m => {
        const e = m.measure.melody[0]?.event
        return e?.sectionLabelBreakAfter || (e?.sectionLabel && measureText(e.sectionLabel, style.annotation, true).width + style.sectionLabelInset > width / 2)
      }).map(m => m.id))
      // Suspended rows outlive the engine's borrowed placement workspace.
      // Their models above therefore own their anchors until completion.
      let completed: StaffSystem | undefined
      const complete = (): StaffSystem => {
        if (completed) return completed
        // Add word connectors before vertical verse packing, so the text and
        // its hyphen move together and share measurement/painting geometry.
        for (const [index, anchor] of lyricAnchors.entries()) {
          if (!hasLyricHyphen(anchor.lyric)) continue
          const next = lyricAnchors.slice(index + 1).find(other => other.lane === anchor.lane && other.lyric.verseIndex === anchor.lyric.verseIndex)
          const edge = next && connectsLyricWord(anchor.lyric, next.lyric) ? next.left : undefined
          const h = lyricHyphenGeometry(anchor.right, anchor.y, lyricSpacing.fontSize / scale, edge)
          anchor.verse.children.push(element('line', { class: 'lyric-hyphen', x1: String(h.left), x2: String(h.right),
            y1: String(h.y), y2: String(h.y), stroke: '#000', 'stroke-width': String(h.stroke), 'stroke-linecap': 'round' }))
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
          const hookTop = staffMusicSize() / 4 * .5
          const labelInk = measureText(`${ending}.`, style.voltaLabel / scale)
          const hookLength = (labelInk.ascent + labelInk.descent) * shared.voltaHookRatio
          node.children.push(element('g', { class: cls }, [
            ...(first ? [element('path', { class: 'm3n-ending-start-hook', d: `M${left} ${(hookTop + hookLength)} V${hookTop}`, stroke: '#000', 'stroke-width': String(shared.voltaStroke / scale), fill: 'none' })] : []),
            element('path', { d: `M${left} ${hookTop} H${right}`, stroke: '#000', 'stroke-width': String(shared.voltaStroke / scale), fill: 'none' }),
            element('path', { d: `M${right} ${hookTop} V${(hookTop + hookLength)}`, stroke: '#000', 'stroke-width': String(shared.voltaStroke / scale), fill: 'none' }),
            ...nodes(text(first ? `${ending}.` : '', left + shared.voltaTextInset / scale, hookTop + (hookLength - labelInk.ascent - labelInk.descent) / 2 + labelInk.ascent, style.voltaLabel, 'ending')),
          ]))
        }
        const tieGeometry = new SvgGeometry(node, measureText, true)
        const localTies = ties.filter(tie => anchors.has(tie.start.id) || anchors.has(tie.end.id))
        const tieSignatures = localTies.length ? ['melody', 'bass'].map(lane => findAll(node, n => hasClass(n, 'staff') && n.attributes['data-staff'] === lane)
          .flatMap(staff => findAll(staff, n => hasClass(n, 'staff-signature') || hasClass(n, 'inline-signature'))
            .flatMap(signature => tieGeometry.pieces(signature)))) : []
        const barJoins = localTies.length ? findAll(node, n => hasClass(n, 'staff-bar'))
          .flatMap(bar => findAll(bar, n => Boolean(n.attributes['data-m3n-join'])))
          .map(rule => rule.attributes['data-m3n-join']!).join(' ') : ''
        for (const tie of localTies) {
          const first = anchors.get(tie.start.id), last = anchors.get(tie.end.id)
          if (!first && !last) continue
          const a = first?.last, b = last?.first
          const staff = first?.staff ?? last!.staff
          staff.children.push(element('g', { class: 'tie', 'data-m3n-join': barJoins }, drawStaffTie(a, b, models[0]!.staves[0]!.noteStartX,
            line.target - inset - engine.endingBarInset, tieSignatures[staff.attributes['data-staff'] === 'bass' ? 1 : 0])))
        }
        const slurMusic: Array<Ink[] | undefined> = []
        // Place inner bows first so enclosing bows clear existing relation ink.
        const span = ({ start, end }: typeof intervals[number]) =>
          (anchors.get(end.id)?.last.headRight ?? line.target - inset - engine.endingBarInset)
          - (anchors.get(start.id)?.first.headLeft ?? models[0]!.start + staffMusicSize() / 4 * 0.2)
        const orderedIntervals = intervals.filter(({ start, end }) => {
          const from = lineOf.get(start.id)!, to = lineOf.get(end.id)!
          return !(lineIndex < from || lineIndex > to)
        }).sort((a, b) =>
          a.interval.kind === 'lg' && b.interval.kind === 'lg' ? span(a) - span(b)
            : Number(b.interval.kind === 'lg') - Number(a.interval.kind === 'lg'))
        const tupletsPlaced = orderedIntervals.some(({ interval }) => interval.kind === 'lg')
        if (tupletsPlaced) placeStaffTuplets(node, tieGeometry, undefined, attachmentGap)
        for (const { interval, start, end } of orderedIntervals) {
          const from = lineOf.get(start.id)!, to = lineOf.get(end.id)!
          if (lineIndex < from || lineIndex > to) continue
          const a = anchors.get(start.id), b = anchors.get(end.id)
          const lane = interval.staff === 'bass' ? 1 : 0
          const left = a?.first.headLeft ?? models[0]!.start + (staffMusicSize() / 4 * 0.2)
          const right = b?.last.headRight ?? (line.target - inset - engine.endingBarInset)
          const yTop = (models[0]!.staves[lane]?.y ?? 0) + staffMusicSize()
          const low = (models[0]!.staves[lane]?.y ?? 0) + (staffMusicSize() * 2)
          if (interval.kind === 'lg') {
            const music = slurMusic[lane] ??= tieGeometry.pieces(element('g', {}, nodes(node).filter(n => hasClass(n, 'measure')).flatMap(m => {
              const staff = nodes(m).filter(n => hasClass(n, 'staff'))[lane]
              return staff ? [element('g', staff.attributes, nodes(staff).filter(n => !hasClass(n, 'verse')))] : []
            })))
            const headTop = (note: StaffNoteAnchor | undefined) => note
            ? Math.min(...note.ys) + staffGlyphMetrics(note.prepared.head, note.prepared.size).top : yTop
          const slur = staffSlur(left, right, yTop, music.filter(p => p.left < right && p.right > left), attachmentGap,
            { left: headTop(a?.first), right: headTop(b?.last) })
            slur.attributes['data-m3n-staff'] = String(lane)
            node.children.push(slur)
            music.push(...tieGeometry.pieces(slur))
          } else if (interval.kind === 'cresc' || interval.kind === 'decres') {
            if (interval.display === 'text') node.children.push(text(interval.kind === 'cresc' ? 'cresc.' : 'dim.', left, low + engine.expressionBottomGap, style.expression, 'dynam', { 'data-m3n-staff': String(lane) }))
            else {
              const y = low + (staffMusicSize() / 4 * 2.5), cresc = interval.kind === 'cresc'
              const endX = Math.max(left + (staffMusicSize() / 4 * 0.4), b?.last.durationEndX ?? right)
              const parent = a?.measure ?? nodes(node).find(n => hasClass(n, 'measure'))!
              parent.children.push(element('g', { class: 'hairpin', 'data-m3n-staff': String(lane) }, [element('path', { d: cresc ? `M${endX} ${y - (shared.hairpinHalfOpening / scale)} L${left} ${y} L${endX} ${y + (shared.hairpinHalfOpening / scale)}` : `M${left} ${y - (shared.hairpinHalfOpening / scale)} L${endX} ${y} L${left} ${y + (shared.hairpinHalfOpening / scale)}`, stroke: '#000', 'stroke-width': String(shared.hairpinStroke / scale), fill: 'none' })]))
            }
          } else if (interval.kind === '8va' || interval.kind === '8vb') {
            const y = interval.kind === '8va' ? yTop - engine.octaveAboveGap : low + engine.octaveBelowGap
            node.children.push(element('g', { class: 'octave', 'data-m3n-staff': String(lane), 'data-m3n-below': String(interval.kind === '8vb') }, [
              ...(a ? nodes(text(interval.kind, left, y, style.octave, 'octave')) : []),
              element('path', { d: `M${left + (a ? engine.octaveTextWidth : 0)} ${y - (staffMusicSize() / 4 * 0.4)} H${right} v${(interval.kind === '8va' ? 1 : -1) * (staffMusicSize() / 4 * 0.8)}`, stroke: '#000', 'stroke-width': String((staffMusicSize() / 4 * 0.1)), 'stroke-dasharray': `${(staffMusicSize() / 4 * 0.4)} ${(staffMusicSize() / 4 * 0.3)}`, fill: 'none' }),
            ]))
          } else if ((interval.kind === 'rit' || interval.kind === 'accel') && a) node.children.push(text(`${interval.kind}.`, left, yTop - engine.expressionTopGap, style.expression, 'dir', { 'font-style': 'italic' }))
        }
        const geometry = tieGeometry
        const system = arrangeStaffSystem(node, geometry, width, headings, deferPieces, tupletsPlaced, attachmentGap)
        system.coreGapBefore = models[0]?.measure.coreGapBefore
        completed = system
        return system
      }
      if(lowerOnly)return {lowerBound:staffSystemLowerBound(node,measureText,width,headings,attachmentGap,style.reuseBeamOuterSpace && models.some(model => model.prepared.beams.some(beam => beam.flexible))),complete}
      const system = complete()
      if (system.staffSpacing > 0.01) { bassY += system.staffSpacing + engine.bassAdjustmentGap; continue }
      return system
    }
    throw new Error('五线谱歌词与低音谱表的净空无法稳定。')
  })
}
