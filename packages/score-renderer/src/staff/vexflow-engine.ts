import {
  Accidental, Articulation, Beam, Dot, Flow, Formatter, Fraction, GraceNote, GraceNoteGroup,
  KeySigNote, TimeSigNote, Modifier, Ornament, Stave, StaveModifierPosition, StaveNote, Stroke, SVGContext, Tuplet, Voice,
  type Note, type Tickable, type TickContext,
} from 'vexflow/bravura'
import type { StaffEvent, StaffMeasure } from './staff-document.js'
import { element, nodes, type MeasureText, type XmlNode } from './layout-svg.js'

import type { StaffLyricText } from './staff-lyric-drawing.js'
import { prepareStaffNoteDrawing, type StaffNoteDrawing } from './staff-note-drawing.js'
import { prepareStaffNoteMetrics } from './staff-note-metrics.js'
import { drawStaffStave } from './staff-stave-drawing.js'
import { drawStaffBeam } from './staff-beam-drawing.js'
import { prepareStaffBeam } from './staff-beam-layout.js'
import { staffModelState } from './staff-model-state.js'
import { StaffSvgContext, captureStaffDrawing, type StaffGlyphTemplates } from './staff-svg-context.js'

export const STAFF_SCALE = 0.7
Flow.setMusicFont('Bravura')
const durationValues = [1, 2, 4, 8, 16, 32, 64, 128].flatMap(dur =>
  [0, 1, 2, 3].map(dots => ({ dur, dots, beats: 4 / dur * (2 - 1 / 2 ** dots) })))
export function staffDuration(beats: number) {
  const value = durationValues.find(d => Math.abs(d.beats - beats) < 1e-7)
  if (!value) throw new Error(`五线谱无法表示时值：${beats}`)
  return value
}
const articulations: Record<string, string> = { str: 'a>', tip: 'a.', brk: 'av', hold: 'a-', fermata: 'a@a', breath: 'a,' }
function prepareStaffNote(item: StaffEvent, clef: string) {
  const { dur, dots } = staffDuration(item.beats), rest = item.event.kind === 'rest'
  const modifiers = item.event.postfixes.flatMap(value => articulations[value]
    ? [{ kind: 'articulation', code: articulations[value]! }]
    : value === 'tr' || value === 'prall' ? [{ kind: 'ornament', code: value === 'tr' ? 'tr' : 'mordent' }] : [])
  return {
    keys: rest ? [clef === 'bass' ? 'd/3' : 'b/4'] : item.pitches.map(p => p.key),
    duration: `${dur}${rest ? 'r' : ''}`, dots, rest, modifiers,
    arpeggio: item.event.postfixes.includes('arp'),
    graces: (item.graces ?? []).map(grace => ({ ...grace, duration: String(grace.duration), keys: grace.pitches.map(p => [p.key]) })),
  }
}
/** Immutable descriptors live only within one prepared measurement task. */
export function createStaffVexPreparation() {
  const notes = new WeakMap<StaffEvent, Map<string, ReturnType<typeof prepareStaffNote>>>()
  const beamGroups = new Map<string, number[]>()
  return {
    lyricAttributes: new WeakMap<StaffEvent, Array<Record<string, string>>>(),
    lyricTexts: new Map<string, StaffLyricText>(),
    noteDrawings: new WeakMap<StaveNote, StaffNoteDrawing | null>(),
    drawingModels: new WeakMap<StaffMeasure, Array<{ model: VexMeasure; reset: () => VexMeasure; active: boolean } | undefined>>(),
    glyphs: new WeakMap() as StaffGlyphTemplates,
    note(item: StaffEvent, clef: string) {
      let byClef = notes.get(item)
      if (!byClef) { byClef = new Map(); notes.set(item, byClef) }
      let saved = byClef.get(clef)
      if (!saved) { saved = prepareStaffNote(item, clef); byClef.set(clef, saved) }
      return saved
    },
    groups(meter: string) {
      let saved = beamGroups.get(meter)
      if (!saved) { saved = Beam.getDefaultBeamGroups(meter).map(group => group.value() * 4); beamGroups.set(meter, saved) }
      return saved
    },
  }
}
export type StaffVexPreparation = ReturnType<typeof createStaffVexPreparation>
// VexFlow 4's Stroke draws a legacy glyph absent from its Bravura-only
// bundle. Keep its modifier measurement, but draw the directionless wave here.
class StaffArpeggio extends Stroke {
  constructor() { super(Stroke.Type.ARPEGGIO_DIRECTIONLESS) }
  override draw() {
    const context = this.checkContext(), note = this.checkAttachedNote()
    const x = note.getModifierStartXY(Modifier.Position.LEFT, 0).x + this.getXShift() - 9
    const ys = note.getYs(), top = Math.min(...ys) - 5, bottom = Math.max(...ys) + 5
    const segments = Math.max(2, Math.ceil((bottom - top) / 6))
    this.setRendered()
    context.openGroup('arpeg')
    context.beginPath().setLineWidth(1).moveTo(x, top)
    for (let i = 0; i < segments; i++) context.quadraticCurveTo(x + (i % 2 ? -4 : 4), top + i * 6 + 3, x, top + (i + 1) * 6)
    context.stroke()
    context.closeGroup()
  }
}
export type VexEntry = { item: StaffEvent; notes: StaveNote[]; tuplet?: Tuplet }
export type VexMeasure = { staves: Stave[]; entries: VexEntry[][]; controls: Note[][]; voices: Voice[]; beams: Beam[]; tuplets: Tuplet[]; columns: Array<{ context: TickContext; x: number; after: number; weight: number }>; minimum: number; metrics: StaffMeasureMetrics; start: number; endInset: number; measure: StaffMeasure; bassY: number }
const barTypes: Record<string, number> = { single: 1, dbl: 2, end: 3, rptstart: 4, rptend: 5, rptboth: 6, invis: 7 }
export type StaffMeasureMetrics = {
  start: number; multiRestWidth: number; endInset: number
  columns: ReadonlyArray<{ left: number; after: number }>
}
/** Preserve the original addition order, including the trailing column gap. */
export function staffMinimumAtSpacing(metrics: StaffMeasureMetrics, spacing: number): number {
  let right = 0
  for (const column of metrics.columns) {
    const x = right + column.left
    right = x + column.after + (spacing * 22 / STAFF_SCALE)
  }
  return Math.max(40, metrics.start + right + 8,
    metrics.start + metrics.multiRestWidth + (metrics.multiRestWidth ? metrics.endInset : 0))
}
export function createVexMeasure(measure: StaffMeasure, first: boolean, hasBass: boolean, measureText: MeasureText, spacing: number, bassY = 140,
  preparation: StaffVexPreparation = createStaffVexPreparation()): VexMeasure {
  const staves = [new Stave(0, 0, 1000), ...(hasBass ? [new Stave(0, bassY, 1000)] : [])]
  for (const [lane, stave] of staves.entries()) {
    stave.setBegBarType(measure.source.left ? barTypes[measure.source.left] ?? 1 : 7)
    stave.setEndBarType(measure.source.right ? barTypes[measure.source.right] ?? 1 : 1)
    if (first) stave.addClef(lane ? 'bass' : 'treble')
    if (first || measure.key !== measure.previousKey) stave.addKeySignature(measure.key, first ? undefined : measure.previousKey)
    if (measure.showMeter) stave.addTimeSignature(`${measure.meterCount}/${measure.meterUnit}`)
  }
  const entries: VexEntry[][] = []
  const controls: Note[][] = []
  const voices: Voice[] = []
  const beams: Beam[] = []
  const tuplets: Tuplet[] = []
  const formatter = new Formatter()
  for (const [lane, items] of [measure.melody, ...(hasBass ? [measure.bass] : [])].entries()) {
    const clef = lane ? 'bass' : 'treble'
    let accidentalKey = measure.key
    const accidentalState = new Map<string, string>()
    const defaultAccidental = (letter: string, key: string) => {
      const keys = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']
      const fifths = keys.indexOf(key) - 7
      const altered = (fifths < 0 ? ['b', 'e', 'a', 'd', 'g', 'c', 'f'] : ['f', 'c', 'g', 'd', 'a', 'e', 'b']).slice(0, Math.abs(fifths))
      return altered.includes(letter) ? fifths < 0 ? 'b' : '#' : ''
    }
    const applyPitchAccidentals = (note: StaveNote, pitches: StaffEvent['pitches']) => {
      for (const [index, pitch] of pitches.entries()) {
        const letter = pitch.key[0]!, octave = pitch.key.split('/')[1]!, id = `${letter}/${octave}`
        const current = accidentalState.get(id) ?? defaultAccidental(letter, accidentalKey)
        const actual = pitch.accidental === 'n' ? '' : pitch.accidental
        if (current !== actual || pitch.explicit) note.addModifier(new Accidental(actual || 'n'), index)
        accidentalState.set(id, actual)
      }
    }
    const noteFor = (item: StaffEvent) => {
      const descriptor = preparation.note(item, clef), { dots, rest } = descriptor
      const note = new StaveNote({ keys: [...descriptor.keys], duration: descriptor.duration, dots, clef, auto_stem: true })
      for (let i = 0; i < dots; i++) Dot.buildAndAttach([note], { all: true })
      for (const modifier of descriptor.modifiers) {
        if (modifier.kind === 'articulation') note.addModifier(new Articulation(modifier.code).setPosition(Modifier.Position.ABOVE))
        else note.addModifier(new Ornament(modifier.code))
      }
      for (const grace of descriptor.graces) {
        const notes = grace.pitches.map((p, index) => {
          const note = new GraceNote({ keys: [...grace.keys[index]!], duration: grace.duration, clef, slash: grace.slash })
          applyPitchAccidentals(note, [p])
          return note
        })
        if (notes.length) note.addModifier(new GraceNoteGroup(notes, true).beamNotes())
      }
      if (!rest) applyPitchAccidentals(note, item.pitches)
      if (descriptor.arpeggio) note.addModifier(new StaffArpeggio())
      note.setStave(staves[lane]!)
      return note
    }
    const laneEntries = items.map(item => {
      if (item.key !== accidentalKey) { accidentalState.clear(); accidentalKey = item.key }
      const entry: VexEntry = { item, notes: (item.children ?? [item]).map(noteFor) }
      if (item.children && item.event.tuplet) {
        entry.tuplet = new Tuplet(entry.notes, { num_notes: item.event.tuplet.num, notes_occupied: item.event.tuplet.numbase })
        tuplets.push(entry.tuplet)
      }
      return entry
    })
    entries.push(laneEntries)
    const tickables: Tickable[] = []
    const laneControls: Note[] = []
    let meter = `${measure.meterCount}/${measure.meterUnit}`
    for (const entry of laneEntries) {
      const nextMeter = `${entry.item.event.meterCount ?? measure.meterCount}/${entry.item.event.meterUnit ?? measure.meterUnit}`
      if (entry.item.onset > 0 && nextMeter !== meter) {
        const control = new TimeSigNote(nextMeter).setStave(staves[lane]!)
        tickables.push(control); laneControls.push(control)
      }
      meter = nextMeter
      if (entry.item.onset > 0 && entry.item.key !== entry.item.previousKey) {
        const control = new KeySigNote(entry.item.key, entry.item.previousKey).setStave(staves[lane]!)
        tickables.push(control); laneControls.push(control)
      }
      tickables.push(...entry.notes)
    }
    controls.push(laneControls)
    if (!tickables.length) continue
    const voice = new Voice({ num_beats: measure.meterCount, beat_value: measure.meterUnit }).setMode(Voice.Mode.SOFT).addTickables(tickables)
    formatter.joinVoices([voice])
    voices.push(voice)
    // Group by performed meter positions, keeping each tuplet an independent
    // rhythm unit. Key changes break beams; fragments retain the original grid.
    const groups = preparation.groups(`${measure.meterCount}/${measure.meterUnit}`)
    const period = groups.reduce((sum, beats) => sum + beats, 0)
    let pending: StaveNote[] = [], bucket = '', key = measure.key
    const flush = () => {
      if (pending.length > 1) {
        const ticks = pending.reduce((sum, note) => sum.add(note.getTicks()), new Fraction(0, 1))
        beams.push(...Beam.generateBeams(pending, { groups: [ticks.divide(Flow.RESOLUTION, 1)] }))
      }
      pending = []
    }
    for (const entry of laneEntries) {
      if (entry.item.key !== key) { flush(); key = entry.item.key }
      const position = entry.item.onset + (measure.beatOffset ?? 0)
      const cycle = Math.floor((position + 1e-7) / period)
      let within = position - cycle * period, group = 0
      while (group + 1 < groups.length && within + 1e-7 >= groups[group]!) within -= groups[group++]!
      const nextBucket = `${cycle}:${group}`
      if (entry.tuplet) {
        flush()
        pending = entry.notes
        flush()
        const pitched = entry.notes.find(note => !note.isRest())
        if (pitched) entry.tuplet.setTupletLocation(pitched.getStemDirection())
        const beam = entry.notes[0]!.getBeam()
        entry.tuplet.setBracketed(!beam || entry.notes.some(note => note.isRest() || note.getBeam() !== beam))
      } else {
        if (nextBucket !== bucket) flush()
        pending.push(...entry.notes)
      }
      bucket = nextBucket
    }
    flush()
  }
  const start = Math.max(...staves.map(s => s.getNoteStartX()))
  staves.forEach(s => s.setNoteStartX(start))
  if (voices.length) formatter.format(voices, 0)
  const contexts = formatter.getTickContexts()?.array ?? []
  const textWidths = new Map<Note, number>()
  for (const lane of entries) for (const entry of lane) for (const [i, note] of entry.notes.entries()) {
    const item = entry.item.children?.[i] ?? entry.item
    const widths = item.lyrics.filter(l => l.kind === 'text').map(l => measureText(l.text.replaceAll('~', ' '), 16 / STAFF_SCALE).width)
    if (item.chord) widths.push(measureText(item.chord, 14 / STAFF_SCALE).width)
    textWidths.set(note, Math.max(0, ...widths))
  }
  let right = 0
  const columnInk: Array<{ left: number; after: number }> = []
  const columns = contexts.map(context => {
    const tickables = context.getTickables()
    const metrics = tickables.map(t => t.getMetrics())
    const lyricWidth = Math.max(0, ...tickables.map(t => textWidths.get(t as Note) ?? 0))
    const left = Math.max(lyricWidth / 2, ...metrics.map(m => m.modLeftPx + m.leftDisplacedHeadPx), 0)
    const after = Math.max(lyricWidth / 2, ...metrics.map(m => m.notePx + m.modRightPx + m.rightDisplacedHeadPx), 0)
    const x = right + left
    columnInk.push({ left, after })
    right = x + after + (spacing * 22 / STAFF_SCALE)
    return { context, x, after, weight: Math.sqrt(Math.max(0.125, context.getMinTicks()?.value() ?? 4096) / 4096) }
  })
  // Multi-rests have no tickables, but their fixed bar and count still need
  // a full body after the clef/key/meter, with padding at both barlines.
  const multiRestWidth = measure.source.interlude ? 59 : measure.source.multiRest
    ? Math.max(43, measureText(String(measure.source.multiRest), 16 / STAFF_SCALE, true).width) + 16
    : 0
  const endInset = Math.max(0, ...staves.flatMap(stave => stave.getModifiers(StaveModifierPosition.END)
    .map(modifier => -(modifier.getLayoutMetrics()?.xMin ?? 0))))
  const minimum = Math.max(40, start + right + 8, start + multiRestWidth + (multiRestWidth ? endInset : 0))
  const metrics: StaffMeasureMetrics = { start, multiRestWidth, endInset, columns: columnInk }
  return { staves, entries, controls, voices, beams, tuplets, columns, minimum, metrics, start, endInset, measure, bassY }
}

export function createStaffDrawingScope() {
  const releases: Array<() => void> = []
  return { add(release: () => void) { releases.push(release) }, close() { releases.forEach(release => release()); releases.length = 0 } }
}
export function createStaffDrawingMeasure(measure: StaffMeasure, first: boolean, hasBass: boolean, measureText: MeasureText,
  spacing: number, bassY: number, preparation: StaffVexPreparation | undefined, scope: ReturnType<typeof createStaffDrawingScope>): VexMeasure {
  if (!preparation) return createVexMeasure(measure, first, hasBass, measureText, spacing, bassY)
  let pair = preparation.drawingModels.get(measure)
  if (!pair) { pair = []; preparation.drawingModels.set(measure, pair) }
  let entry = pair[first ? 1 : 0]
  if (!entry) {
    const model = createVexMeasure(measure, first, hasBass, measureText, spacing, bassY, preparation)
    model.beams.forEach(prepareStaffBeam)
    for (const lane of model.entries) for (const item of lane) item.notes.forEach(prepareStaffNoteMetrics)
    entry = { model, reset: staffModelState(model, preparation.noteDrawings), active: false }
    pair[first ? 1 : 0] = entry
  } else {
    if (entry.active) throw new Error('五线谱绘制模型不能同时借给两个谱行。')
    entry.model = entry.reset()
  }
  entry.active = true
  const leased = entry
  scope.add(() => { leased.active = false })
  const model = entry.model
  let right = 0
  for (let i = 0; i < model.columns.length; i++) {
    const fixed = model.metrics.columns[i]!, column = model.columns[i]!
    column.x = right + fixed.left
    right = column.x + fixed.after + (spacing * 22 / STAFF_SCALE)
  }
  model.minimum = staffMinimumAtSpacing(model.metrics, spacing)
  for (const [lane, stave] of model.staves.entries()) {
    const y = lane ? bassY : 0, moved = stave.getY() !== y
    if (moved) stave.setY(y)
    for (const item of model.entries[lane]!) for (const note of item.notes) {
      if (moved) note.setStave(stave)
      note.setRendered(false)
    }
  }
  model.bassY = bassY
  return model
}

function normalizeVexDrawing(n: XmlNode): void {
      if (n.attributes.id?.startsWith('vf-')) delete n.attributes.id
      if (n.attributes.class) n.attributes.class = n.attributes.class.replace(/vf-/g, '')
      if (n.tagName === 'path' && n.attributes.fill === 'none' && !n.attributes.stroke) {
        n.attributes.stroke = '#000'
        n.attributes['stroke-width'] ??= '1'
      }
      if (n.attributes['font-size']?.endsWith('pt')) n.attributes['font-size'] = String(parseFloat(n.attributes['font-size']) * 4 / 3)
      for (const child of n.children) if (typeof child !== 'string') normalizeVexDrawing(child)
    }

/** VexFlow is confined to local music geometry; page policy stays in M3N. */
export function drawVexMeasure(model: VexMeasure, width: number, x: number, context: SVGContext, preparation?: StaffVexPreparation) {
  model.staves.forEach(stave => { stave.setX(x).setWidth(width); stave.setNoteStartX(x + model.start) })
  const extra = Math.max(0, width - model.minimum)
  const totalWeight = model.columns.reduce((n, c) => n + c.weight, 0)
  let cumulative = 0
  for (const column of model.columns) {
    column.context.setX(column.x + extra * (totalWeight ? cumulative / totalWeight : 0))
    cumulative += column.weight
  }
  const node = element('g', { id: model.measure.id, class: 'measure' })
  const capture = (draw: () => void): XmlNode[] => {
    const output = captureStaffDrawing(context, draw)
    output.forEach(normalizeVexDrawing)
    return output
  }
  for (const [lane, stave] of model.staves.entries()) {
    const staff = element('g', { class: 'staff', 'data-staff': lane ? 'bass' : 'melody' })
    // Retain direct staff paths for geometry audits and interaction consumers.
    const raw = preparation ? drawStaffStave(stave, context, preparation, normalizeVexDrawing) : capture(() => stave.setContext(context).draw())
    stave.setNoteStartX(x + model.start)
    const flatten = (nodes: XmlNode[]): XmlNode[] => nodes.flatMap(n => n.tagName === 'g' && !n.attributes.transform && !n.renderNodes ? flatten(n.children.filter((c): c is XmlNode => typeof c !== 'string')) : [n])
    const staveDrawing = flatten(raw)
    // VexFlow emits the five stave rules before the clef and signatures.
    for (const rule of staveDrawing.slice(0, 5)) rule.attributes.class = 'staff-line'
    staff.children.push(...staveDrawing)
    for (const control of model.controls[lane]!)
      staff.children.push(element('g', { class: 'inline-signature' }, capture(() => control.setContext(context).draw())))
    for (const entry of model.entries[lane]!) {
      const item = entry.item
      const attrs: Record<string, string> = { id: item.id, class: item.event.kind }
      if (/-rend\d+$/.test(item.id)) {
        attrs['data-m3n-id'] = item.id.replace(/-rend\d+$/, '')
        attrs['data-m3n-passes'] = /-rend(\d+)$/.exec(item.id)![1]!
      }
      const event = element('g', attrs)
      entry.notes.forEach((note, i) => {
        let music: XmlNode[]
        let normalized = false
        if (preparation && !note.getModifiers().some(modifier => modifier instanceof GraceNoteGroup)) {
          let template = preparation.noteDrawings.get(note)
          if (template === undefined) {
            const tick = note.getTickContext(), tickX = tick.getX(), startX = stave.getNoteStartX(), staveY = stave.getY()
            const recording = new StaffSvgContext(preparation.glyphs, true)
            try {
              stave.setY(0).setNoteStartX(0)
              tick.setX(-Flow.getMusicFontStack()[0]!.lookupMetric('stave.padding'))
              note.setStave(stave)
              const drawing = captureStaffDrawing(recording, () => note.setContext(recording).draw())
              drawing.forEach(normalizeVexDrawing)
              const normalizeNote = (node: XmlNode) => {
                node.attributes.class = (node.attributes.class ?? '').replace(/vf-/g, '')
                if (node.attributes.id) delete node.attributes.id
                for (const child of node.children) if (typeof child !== 'string') normalizeNote(child)
              }
              drawing.forEach(normalizeNote)
              template = prepareStaffNoteDrawing(drawing) ?? null
              preparation.noteDrawings.set(note, template)
            } finally { stave.setY(staveY).setNoteStartX(startX); tick.setX(tickX); note.setStave(stave) }
          }
          normalized = Boolean(template)
          music = template ? template.place(note.getAbsoluteX(), stave.getY(), !item.children) : capture(() => note.setContext(context).draw())
          const stem = note.getStem()
          if (stem) { const stemX = note.getStemX(); stem.setNoteHeadXBounds(stemX, stemX) }
        } else music = capture(() => note.setContext(context).draw())
        const normalize = (n: XmlNode) => {
          n.attributes.class = (n.attributes.class ?? '').replace(/vf-/g, '')
          if (n.attributes.id) delete n.attributes.id
          for (const child of n.children) if (typeof child !== 'string') normalize(child)
        }
        if (!normalized) music.forEach(normalize)
        if (item.children) event.children.push(element('g', { id: item.children[i]!.id, class: item.children[i]!.event.kind }, music))
        else event.children.push(...music.flatMap(n => n.tagName === 'g' && n.attributes.class === 'stavenote' ? n.children : [n]))
      })
      staff.children.push(event)
    }
    node.children.push(staff)
  }
  for (const beam of model.beams) {
    const lane = model.entries.findIndex(entries => entries.some(e => e.notes.includes(beam.notes[0]! as StaveNote)))
    nodes(node).filter(n => n.attributes.class === 'staff')[Math.max(0, lane)]!.children.push(element('g', { class: 'beam' }, preparation ? drawStaffBeam(beam) : capture(() => beam.setContext(context).draw())))
  }
  for (const tuplet of model.tuplets) {
    const markup = capture(() => tuplet.setContext(context).draw())
    const lane = model.entries.findIndex(entries => entries.some(e => e.tuplet === tuplet))
    const entry = model.entries[lane]!.find(e => e.tuplet === tuplet)!
    const below = entry.notes.find(note => !note.isRest())?.getStemDirection() === -1
    nodes(node).filter(n => n.attributes.class === 'staff')[lane]!.children.push(element('g', {
      class: 'm3n-tuplet-label', 'data-m3n-below': String(below),
    }, [element('g', { class: 'tupletNum' }, markup)]))
  }
  return node
}
export function createStaffContext(preparation?: StaffVexPreparation) {
  return new StaffSvgContext(preparation?.glyphs)
}
