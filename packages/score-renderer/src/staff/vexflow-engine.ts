import {
  Accidental, Articulation, Beam, Dot, Flow, Formatter, Fraction, GraceNote, GraceNoteGroup,
  KeySigNote, TimeSigNote, Modifier, Ornament, Stave, StaveModifierPosition, StaveNote, SVGContext, Tuplet, Voice,
  type Note, type Tickable,
} from 'vexflow/bravura'
import type { StaffEvent, StaffMeasure } from './staff-document.js'
import { element, readXml, nodes, type MeasureText, type XmlNode } from './layout-svg.js'

export const STAFF_SCALE = 0.7
Flow.setMusicFont('Bravura')
const durationValues = [1, 2, 4, 8, 16, 32, 64, 128].flatMap(dur =>
  [0, 1, 2, 3].map(dots => ({ dur, dots, beats: 4 / dur * (2 - 1 / 2 ** dots) })))
export function staffDuration(beats: number) {
  const value = durationValues.find(d => Math.abs(d.beats - beats) < 1e-7)
  if (!value) throw new Error(`五线谱无法表示时值：${beats}`)
  return value
}
export type VexEntry = { item: StaffEvent; notes: StaveNote[]; tuplet?: Tuplet }
export type VexMeasure = ReturnType<typeof createVexMeasure>
const barTypes: Record<string, number> = { single: 1, dbl: 2, end: 3, rptstart: 4, rptend: 5, rptboth: 6, invis: 7 }
export function createVexMeasure(measure: StaffMeasure, first: boolean, hasBass: boolean, measureText: MeasureText, spacing: number, bassY = 140) {
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
      const { dur, dots } = staffDuration(item.beats)
      const rest = item.event.kind === 'rest'
      const note = new StaveNote({ keys: rest ? [lane ? 'd/3' : 'b/4'] : item.pitches.map(p => p.key), duration: `${dur}${rest ? 'r' : ''}`, dots, clef, auto_stem: true })
      for (let i = 0; i < dots; i++) Dot.buildAndAttach([note], { all: true })
      const articulations: Record<string, string> = { str: 'a>', tip: 'a.', brk: 'av', hold: 'a-', fermata: 'a@a', breath: 'a,' }
      for (const value of item.event.postfixes) {
        if (articulations[value]) note.addModifier(new Articulation(articulations[value]).setPosition(Modifier.Position.ABOVE))
        if (value === 'tr' || value === 'prall') note.addModifier(new Ornament(value === 'tr' ? 'tr' : 'mordent'))
      }
      for (const grace of item.graces ?? []) {
        const notes = grace.pitches.map(p => {
          const note = new GraceNote({ keys: [p.key], duration: String(grace.duration), clef, slash: grace.slash })
          applyPitchAccidentals(note, [p])
          return note
        })
        if (notes.length) note.addModifier(new GraceNoteGroup(notes, true).beamNotes())
      }
      if (!rest) applyPitchAccidentals(note, item.pitches)
      note.setStave(staves[lane]!)
      return note
    }
    const laneEntries = items.map(item => {
      if (item.key !== accidentalKey) { accidentalState.clear(); accidentalKey = item.key }
      const entry: VexEntry = { item, notes: (item.children ?? [item]).map(noteFor) }
      if (item.children && item.event.tuplet) {
        entry.tuplet = new Tuplet(entry.notes, { num_notes: item.event.tuplet.num, notes_occupied: item.event.tuplet.numbase, bracketed: true, ratioed: false })
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
    const groups = measure.meterUnit >= 8 && measure.meterCount % 3 === 0
      ? [new Fraction(3, measure.meterUnit)] : [new Fraction(1, measure.meterUnit)]
    beams.push(...Beam.generateBeams(laneEntries.flatMap(e => e.notes), { groups }))
    // Rest stems are placeholders, so a leading rest must not choose the
    // tuplet's side. Use the pitched notes after beaming has set their stems.
    for (const entry of laneEntries) {
      const pitched = entry.notes.find(note => !note.isRest())
      if (entry.tuplet && pitched) entry.tuplet.setTupletLocation(pitched.getStemDirection())
    }
  }
  const start = Math.max(...staves.map(s => s.getNoteStartX()))
  staves.forEach(s => s.setNoteStartX(start))
  if (voices.length) formatter.format(voices, 0)
  const contexts = formatter.getTickContexts()?.array ?? []
  const textWidths = new Map<Note, number>()
  for (const lane of entries) for (const entry of lane) for (const [i, note] of entry.notes.entries()) {
    const item = entry.item.children?.[i] ?? entry.item
    const widths = item.lyrics.filter(l => l.kind === 'text').map(l => measureText(l.text.replaceAll('~', ' '), 16 / STAFF_SCALE).width)
    if (item.event.chord) widths.push(measureText(item.event.chord, 14 / STAFF_SCALE).width)
    textWidths.set(note, Math.max(0, ...widths))
  }
  let right = 0
  const columns = contexts.map(context => {
    const tickables = context.getTickables()
    const metrics = tickables.map(t => t.getMetrics())
    const lyricWidth = Math.max(0, ...tickables.map(t => textWidths.get(t as Note) ?? 0))
    const left = Math.max(lyricWidth / 2, ...metrics.map(m => m.modLeftPx + m.leftDisplacedHeadPx), 0)
    const after = Math.max(lyricWidth / 2, ...metrics.map(m => m.notePx + m.modRightPx + m.rightDisplacedHeadPx), 0)
    const x = right + left
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
  return { staves, entries, controls, voices, beams, tuplets, columns, minimum, start, endInset, measure, bassY }
}

/** VexFlow is confined to local music geometry; page policy stays in M3N. */
export function drawVexMeasure(model: VexMeasure, width: number, x: number, context: SVGContext) {
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
    const group = context.openGroup()
    draw()
    context.closeGroup()
    const output = nodes(readXml(group.outerHTML))
    const normalize = (n: XmlNode) => {
      if (n.attributes.id?.startsWith('vf-')) delete n.attributes.id
      if (n.attributes.class) n.attributes.class = n.attributes.class.replace(/vf-/g, '')
      if (n.tagName === 'path' && n.attributes.fill === 'none' && !n.attributes.stroke) {
        n.attributes.stroke = '#000'
        n.attributes['stroke-width'] ??= '1'
      }
      if (n.attributes['font-size']?.endsWith('pt')) n.attributes['font-size'] = String(parseFloat(n.attributes['font-size']) * 4 / 3)
      n.children.filter((c): c is XmlNode => typeof c !== 'string').forEach(normalize)
    }
    output.forEach(normalize)
    return output
  }
  for (const [lane, stave] of model.staves.entries()) {
    const staff = element('g', { class: 'staff', 'data-staff': lane ? 'bass' : 'melody' })
    // Retain direct staff paths for geometry audits and interaction consumers.
    const raw = capture(() => stave.setContext(context).draw())
    stave.setNoteStartX(x + model.start)
    const flatten = (nodes: XmlNode[]): XmlNode[] => nodes.flatMap(n => n.tagName === 'g' && !n.attributes.transform ? flatten(n.children.filter((c): c is XmlNode => typeof c !== 'string')) : [n])
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
        const music = capture(() => note.setContext(context).draw())
        const normalize = (n: XmlNode) => {
          n.attributes.class = (n.attributes.class ?? '').replace(/vf-/g, '')
          if (n.attributes.id) delete n.attributes.id
          n.children.filter((c): c is XmlNode => typeof c !== 'string').forEach(normalize)
        }
        music.forEach(normalize)
        if (item.children) event.children.push(element('g', { id: item.children[i]!.id, class: item.children[i]!.event.kind }, music))
        else event.children.push(...music.flatMap(n => n.tagName === 'g' && n.attributes.class === 'stavenote' ? n.children : [n]))
      })
      staff.children.push(event)
    }
    node.children.push(staff)
  }
  for (const beam of model.beams) {
    const lane = model.entries.findIndex(entries => entries.some(e => e.notes.includes(beam.notes[0]! as StaveNote)))
    nodes(node).filter(n => n.attributes.class === 'staff')[Math.max(0, lane)]!.children.push(element('g', { class: 'beam' }, capture(() => beam.setContext(context).draw())))
  }
  for (const tuplet of model.tuplets) {
    const markup = capture(() => tuplet.setContext(context).draw())
    const lane = model.entries.findIndex(entries => entries.some(e => e.tuplet === tuplet))
    nodes(node).filter(n => n.attributes.class === 'staff')[Math.max(0, lane)]!.children.push(element('g', { class: 'tupletNum' }, markup))
  }
  return node
}
export function createStaffContext() {
  return new SVGContext(document.createElement('div'))
}
