import { SCORE_TEXT_FONT, lyricSpacing, scoreLayoutConfig, scoreAttachmentHeight } from '@m3n/numbered-notation'
import type { StaffEvent, StaffMeasure } from './staff-document.js'
import { element, setNumericPath, type MeasureText, type XmlNode } from './layout-svg.js'
import type { StaffLyricText } from './staff-lyric-drawing.js'
import { staffCommandPath } from './staff-glyph-primitive.js'
import { staffMusicSize, staffGlyph, staffGlyphMetrics, staffSignatureAdvance, type StaffGlyph } from './staff-music-font.js'

const style = scoreLayoutConfig.staff
const engine = style.engine
export const STAFF_SCALE = engine.scale
const durations = [1, 2, 4, 8, 16, 32, 64, 128].flatMap(dur =>
  [0, 1, 2, 3].map(dots => ({ dur, dots, beats: 4 / dur * (2 - 1 / 2 ** dots) })))
export function staffDuration(beats: number) {
  const value = durations.find(d => Math.abs(d.beats - beats) < 1e-7)
  if (!value) throw new Error(`五线谱无法表示时值：${beats}`)
  return value
}
export type StaffMeasureMetrics = {
  start: number; multiRestWidth: number; endInset: number
  columns: ReadonlyArray<{ left: number; after: number; lyricLeft: number; lyricAfter: number }>
}
function columnInsets(column: StaffMeasureMetrics['columns'][number], first: boolean, gap: number) {
  return { left: Math.max(column.left + (first ? 0 : gap / 2), column.lyricLeft),
    after: Math.max(column.after + gap / 2, column.lyricAfter) }
}
export function staffMinimumAtSpacing(metrics: StaffMeasureMetrics, spacing: number): number {
  const gap = spacing * engine.spacingUnit / STAFF_SCALE
  let right = 0
  for (const [i, column] of metrics.columns.entries()) {
    const insets = columnInsets(column, i === 0, gap)
    right += insets.left + insets.after
  }
  if (metrics.columns.length) right += gap / 2
  return Math.max(engine.minimumMeasureWidth, metrics.start + right + engine.measureEndGap + metrics.endInset,
    metrics.start + metrics.multiRestWidth + (metrics.multiRestWidth ? metrics.endInset : 0))
}
const keys = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']
const fifths = (key: string) => {
  const index = keys.indexOf(key)
  if (index < 0) throw new Error(`五线谱不支持调号：${key}`)
  return index - 7
}
const alterations = (key: string) => (fifths(key) < 0 ? ['b', 'e', 'a', 'd', 'g', 'c', 'f'] : ['f', 'c', 'g', 'd', 'a', 'e', 'b']).slice(0, Math.abs(fifths(key)))
const accidentalGlyphs: Record<string, StaffGlyph> = { '#': 'accidentalSharp', b: 'accidentalFlat', n: 'accidentalNatural', '##': 'accidentalDoubleSharp', bb: 'accidentalDoubleFlat' }
export function staffPitchY(key: string, bass: boolean): number {
  const [pitch, octave] = key.split('/')
  const step = 'cdefgab'.indexOf(pitch![0]!) + Number(octave) * 7
  if (!Number.isFinite(step) || !/^[a-g][#b]*\/-?\d+$/.test(key)) throw new Error(`五线谱音高无效：${key}`)
  return (staffMusicSize() * 2) - (step - (bass ? 2 * 7 + 4 : 4 * 7 + 2)) * (staffMusicSize() / 8)
}
type SymbolPlacement = { glyph: StaffGlyph; x: number; y: number; size?: number }
type Signature = { symbols: SymbolPlacement[]; width: number }
function keySignature(key: string, previous: string | undefined, bass: boolean): Signature {
  const next = fifths(key), old = previous === undefined ? 0 : fifths(previous)
  const symbols: SymbolPlacement[] = []
  let x = 0
  const sharpYs = bass ? [5, 6.5, 4.5, 6, 7.5, 5.5, 7].map(y => y * (staffMusicSize() / 4)) : [4, 5.5, 3.5, 5, 6.5, 4.5, 6].map(y => y * (staffMusicSize() / 4))
  const flatYs = bass ? [7, 5.5, 7.5, 6, 8, 6.5, 8.5].map(y => y * (staffMusicSize() / 4)) : [6, 4.5, 6.5, 5, 7, 5.5, 7.5].map(y => y * (staffMusicSize() / 4))
  const add = (glyph: StaffGlyph, y: number) => {
    const m = staffGlyphMetrics(glyph)
    let position = x - m.left
    if (symbols.at(-1)?.glyph === glyph) {
      const ys = glyph === 'accidentalSharp' || (glyph === 'accidentalNatural' && old > 0) ? sharpYs : flatYs
      // One step for the whole group: allow only slight ink-box overlap,
      // and keep the outline clearance for every vertical transition.
      const step = Math.max(m.right - m.left - staffMusicSize() / 4 * 0.08,
        ...ys.slice(1).map((y, i) => staffSignatureAdvance(glyph, y - ys[i]!)))
      position = symbols.at(-1)!.x + step
    }
    symbols.push({ glyph, x: position, y })
    x = Math.max(x, position + m.right)
  }
  if (old && (Math.sign(old) !== Math.sign(next) || Math.abs(next) < Math.abs(old))) {
    for (let i = Math.sign(old) === Math.sign(next) ? Math.abs(next) : 0; i < Math.abs(old); i++)
      add('accidentalNatural', (old > 0 ? sharpYs : flatYs)[i]!)
    if (next) x += staffMusicSize() / 4 * 0.6
  }
  for (let i = 0; i < Math.abs(next); i++) add(next > 0 ? 'accidentalSharp' : 'accidentalFlat', (next > 0 ? sharpYs : flatYs)[i]!)
  return { symbols, width: x + (symbols.length ? staffMusicSize() / 4 * 0.3 : 0) }
}
function meterSignature(count: number, unit: number): Signature {
  const symbols: SymbolPlacement[] = []
  const widths = [count, unit].map(value => [...String(value)].reduce((sum, digit) => sum + staffGlyphMetrics(`time${digit}` as StaffGlyph).advance, 0))
  const width = Math.max(...widths)
  for (const [row, value] of [count, unit].entries()) {
    let x = (width - widths[row]!) / 2
    for (const digit of String(value)) {
      const glyph = `time${digit}` as StaffGlyph
      symbols.push({ glyph, x, y: row ? (staffMusicSize() * 2) : (staffMusicSize() * 1.5) }); x += staffGlyphMetrics(glyph).advance
    }
  }
  return { symbols, width: width + (staffMusicSize() / 4 * 0.6) }
}
function appendSignature(target: Signature, next: Signature) {
  target.symbols.push(...next.symbols.map(symbol => ({ ...symbol, x: symbol.x + target.width })))
  target.width += next.width
}
type Head = { x: number; y: number }
export type PreparedNote = {
  item: StaffEvent; dur: number; dots: number; size: number; rest: boolean; direction: number; head: StaffGlyph
  heads: Head[]; symbols: SymbolPlacement[]; left: number; after: number; signature: Signature
  graces: Array<{ note: PreparedNote; x: number; slash: boolean }>; graceWidth: number
}
type PreparedEntry = { item: StaffEvent; notes: PreparedNote[] }
export type PreparedMeasure = { entries: PreparedEntry[][]; metrics: StaffMeasureMetrics; signatures: Signature[]; onsets: number[]; weights: number[]; beams: Array<{ lane: number; indices: number[] }> }
/** Only immutable local descriptors belong to a task; candidate anchors are fresh. */
export function createStaffPreparation() {
  const measures = new WeakMap<StaffMeasure, Map<string, PreparedMeasure>>()
  return {
    lyricAttributes: new WeakMap<StaffEvent, Array<Record<string, string>>>(), lyricTexts: new Map<string, StaffLyricText>(),
    measure(measure: StaffMeasure, first: boolean, hasBass: boolean, measureText: MeasureText) {
      let variants = measures.get(measure)
      if (!variants) { variants = new Map(); measures.set(measure, variants) }
      const key = `${first}:${hasBass}`
      let prepared = variants.get(key)
      if (!prepared) { prepared = prepareMeasure(measure, first, hasBass, measureText); variants.set(key, prepared) }
      return prepared
    },
  }
}
export type StaffPreparation = ReturnType<typeof createStaffPreparation>
const marks: Record<string, StaffGlyph> = { str: 'articAccentAbove', tip: 'articStaccatoAbove', brk: 'articStaccatissimoAbove', hold: 'articTenutoAbove', fermata: 'fermataAbove', breath: 'breathMarkComma', tr: 'ornamentTrill', prall: 'ornamentShortTrill' }
function prepareNote(item: StaffEvent, bass: boolean, accidentalState: Map<string, string>, key: string, grace = false): PreparedNote {
  const { dur, dots } = staffDuration(item.beats), rest = item.event.kind === 'rest'
  const ys = rest ? [(staffMusicSize() * 1.5)] : item.pitches.map(p => staffPitchY(p.key, bass))
  const direction = rest || ys.reduce((sum, y) => sum + y, 0) / ys.length > (staffMusicSize() * 1.5) ? 1 : -1
  const head: StaffGlyph = rest ? `rest${dur}` as StaffGlyph : dur === 1 ? 'noteheadWhole' : dur === 2 ? 'noteheadHalf' : 'noteheadBlack'
  const size = (grace ? (style.music * .65) : style.music) / STAFF_SCALE, headWidth = staffGlyphMetrics(head, size).right - staffGlyphMetrics(head, size).left
  const ordered = ys.map((y, index) => ({ y, index })).sort((a, b) => direction * (b.y - a.y))
  const heads: Head[] = ys.map(y => ({ x: 0, y }))
  let displaced = false
  for (let i = 1; i < ordered.length; i++) {
    displaced = Math.abs(ordered[i]!.y - ordered[i - 1]!.y) <= (staffMusicSize() / 8) && !displaced
    heads[ordered[i]!.index]!.x = displaced ? direction * (headWidth - (staffMusicSize() / 4 * 0.1)) : 0
  }
  const symbols: SymbolPlacement[] = []
  const graces: PreparedNote['graces'] = []
  let graceWidth = 0
  // Grace accidentals precede host accidentals in performed order.
  if (!grace) for (const group of item.graces ?? []) for (const pitch of group.pitches) {
    const child = { ...item, pitches: [pitch], beats: 4 / group.duration, graces: [], lyrics: [], event: { ...item.event, kind: 'note' as const, postfixes: [] } }
    const note = prepareNote(child, bass, accidentalState, key, true)
    graces.push({ note, x: graceWidth + note.left, slash: group.slash }); graceWidth += note.left + note.after + (staffMusicSize() / 4 * 0.5)
  }
  let left = Math.max(0, -Math.min(...heads.map(h => h.x)))
  let after = Math.max(...heads.map(h => h.x)) + headWidth
  const accidentalColumns: Array<{ x: number; top: number; bottom: number }> = []
  if (!rest) for (const { y, index } of ordered) {
    const pitch = item.pitches[index]!, identity = `${pitch.key[0]}/${pitch.key.split('/')[1]}`
    const defaultValue = alterations(key).includes(pitch.key[0]!) ? fifths(key) < 0 ? 'b' : '#' : ''
    const current = accidentalState.get(identity) ?? defaultValue, actual = pitch.accidental === 'n' ? '' : pitch.accidental
    if (pitch.explicit || current !== actual) {
      const glyph = accidentalGlyphs[actual || 'n']
      if (!glyph) throw new Error(`五线谱无法表示变音记号：${actual}`)
      const m = staffGlyphMetrics(glyph, size)
      const top = y + m.top, bottom = y + m.bottom
      let right = -left - (staffMusicSize() / 4 * 0.3)
      for (const previous of accidentalColumns) if (top < previous.bottom + (staffMusicSize() / 4 * 0.3) && bottom + (staffMusicSize() / 4 * 0.3) > previous.top) right = Math.min(right, previous.x - (staffMusicSize() / 4 * 0.3))
      const x = right - m.right
      symbols.push({ glyph, x, y, size }); accidentalColumns.push({ x: x + m.left, top, bottom })
    }
    accidentalState.set(identity, actual)
  }
  for (const symbol of symbols) left = Math.max(left, -symbol.x - staffGlyphMetrics(symbol.glyph, size).left)
  for (let dot = 0; dot < dots; dot++) for (const y of [...new Set(ys.map(y => y % (staffMusicSize() / 4) === 0 ? y - (staffMusicSize() / 8) : y))])
    symbols.push({ glyph: 'augmentationDot', x: after + (staffMusicSize() / 4 * 0.3) + dot * (staffMusicSize() / 4 * 0.5), y, size })
  if (dots) after += (staffMusicSize() / 4 * 0.3) + dots * (staffMusicSize() / 4 * 0.5)
  // Host flags are measured after beam membership is known. Grace flags remain independent.
  if (grace && !rest && dur >= 8) after = Math.max(after, headWidth + staffGlyphMetrics(`flag${dur}Up` as StaffGlyph, size).right)
  if (!grace) {
    let markTop = Math.min(staffMusicSize(), ...ys) - (staffMusicSize() / 4 * 1)
    for (const value of item.event.postfixes) if (marks[value]) {
      const glyph = marks[value]!, base = staffGlyphMetrics(glyph)
      const height = scoreAttachmentHeight(value)
      const size = height === undefined ? staffMusicSize() : staffMusicSize() * height / STAFF_SCALE / (base.bottom - base.top)
      const m = staffGlyphMetrics(glyph, size)
      symbols.push({ glyph, size, x: headWidth / 2 - (m.left + m.right) / 2, y: markTop - m.bottom })
      markTop -= m.bottom - m.top + (staffMusicSize() / 4 * 0.5)
      left = Math.max(left, (m.right - m.left - headWidth) / 2)
      after = Math.max(after, (m.right - m.left + headWidth) / 2)
    }
    if (item.event.postfixes.includes('arp')) left += (staffMusicSize() / 4 * 1.2)
  }
  if (graces.length) left += graceWidth + (staffMusicSize() / 4 * 0.5)
  return { item, dur, dots, size, rest, direction, head, heads, symbols, left, after, signature: { symbols: [], width: 0 }, graces, graceWidth }
}
function beamGroups(count: number, unit: number) {
  if (count > 3 && count % 3 === 0) return Array.from({ length: count / 3 }, () => 12 / unit)
  return Array.from({ length: Math.ceil(count * 4 / unit) }, () => 1)
}
function prepareMeasure(measure: StaffMeasure, first: boolean, hasBass: boolean, measureText: MeasureText): PreparedMeasure {
  const signatures: Signature[] = [], beams: PreparedMeasure['beams'] = []
  const entries = [measure.melody, ...(hasBass ? [measure.bass] : [])].map((items, lane) => {
    const bass = lane === 1, signature: Signature = { symbols: [], width: (staffMusicSize() / 4 * 0.6) }
    if (first) {
      const glyph = bass ? 'fClef' : 'gClef', m = staffGlyphMetrics(glyph)
      appendSignature(signature, { symbols: [{ glyph, x: -m.left, y: bass ? (staffMusicSize() / 4) * 5 : (staffMusicSize() / 4) * 7 }], width: m.right - m.left + (staffMusicSize() / 4 * 1) })
    }
    if (first || measure.key !== measure.previousKey) appendSignature(signature, keySignature(measure.key, first ? undefined : measure.previousKey, bass))
    if (measure.showMeter) appendSignature(signature, meterSignature(measure.meterCount, measure.meterUnit))
    signatures.push(signature)
    let key = measure.key, meter = `${measure.meterCount}/${measure.meterUnit}`
    const accidentals = new Map<string, string>()
    const laneEntries = items.map(item => {
      if (item.key !== key) accidentals.clear()
      const nextMeter = `${item.event.meterCount ?? measure.meterCount}/${item.event.meterUnit ?? measure.meterUnit}`
      const inline: Signature = { symbols: [], width: 0 }
      if (item.onset > 0 && item.key !== key) appendSignature(inline, keySignature(item.key, key, bass))
      if (item.onset > 0 && nextMeter !== meter) appendSignature(inline, meterSignature(item.event.meterCount!, item.event.meterUnit!))
      key = item.key; meter = nextMeter
      const notes = (item.children ?? [item]).map(child => prepareNote(child, bass, accidentals, key))
      if (inline.width) { notes[0]!.signature = inline; notes[0]!.left += inline.width + (staffMusicSize() / 4 * 0.6) }
      return { item, notes }
    })
    let pending: number[] = [], bucket = '', previousKey = measure.key, index = 0
    const flat = laneEntries.flatMap(entry => entry.notes)
    const flush = () => {
      if (pending.length > 1) beams.push({ lane, indices: pending })
      pending = []
    }
    for (const entry of laneEntries) {
      const count = entry.item.event.meterCount ?? measure.meterCount, unit = entry.item.event.meterUnit ?? measure.meterUnit
      const groups = beamGroups(count, unit), period = groups.reduce((sum, n) => sum + n, 0)
      const position = entry.item.onset + (measure.beatOffset ?? 0), cycle = Math.floor((position + 1e-7) / period)
      let within = position - cycle * period, group = 0
      while (group + 1 < groups.length && within + 1e-7 >= groups[group]!) within -= groups[group++]!
      const next = `${count}/${unit}:${cycle}:${group}`
      if (next !== bucket || previousKey !== entry.item.key || entry.item.children) flush()
      for (const note of entry.notes) {
        if (note.rest || note.dur < 8) flush()
        else pending.push(index)
        index++
      }
      if (entry.item.children) flush()
      bucket = next; previousKey = entry.item.key
    }
    flush()
    // A beam group has one stem direction, independent of candidate width.
    for (const beam of beams.filter(beam => beam.lane === lane)) {
      const notes = beam.indices.map(i => flat[i]!), ys = notes.flatMap(note => note.heads.map(head => head.y))
      const direction = ys.reduce((sum, y) => sum + y, 0) / ys.length > (staffMusicSize() * 1.5) ? 1 : -1
      for (const note of notes) {
        if (note.direction === direction) continue
        const oldLeft = Math.max(0, -Math.min(...note.heads.map(h => h.x)))
        note.direction = direction
        const headWidth = staffGlyphMetrics(note.head, note.size).right
        const heads = [...note.heads].sort((a, b) => direction * (b.y - a.y))
        let displaced = false
        for (const [i, head] of heads.entries()) {
          displaced = i > 0 && Math.abs(head.y - heads[i - 1]!.y) <= (staffMusicSize() / 8) && !displaced
          head.x = displaced ? direction * (headWidth - (staffMusicSize() / 4 * 0.1)) : 0
        }
        const newLeft = Math.max(0, -Math.min(...heads.map(h => h.x))), shift = Math.max(0, newLeft - oldLeft)
        note.left += shift
        for (const symbol of note.symbols) if (symbol.glyph.startsWith('accidental')) symbol.x -= shift
        note.after = Math.max(note.after, Math.max(...heads.map(h => h.x)) + headWidth)
      }
    }
    const beamed = new Set(beams.filter(beam => beam.lane === lane).flatMap(beam => beam.indices))
    for (const [i, note] of flat.entries()) if (!note.rest && note.dur >= 8 && !beamed.has(i)) {
      const head = staffGlyphMetrics(note.head, note.size)
      note.after = Math.max(note.after, head.right - head.left + staffGlyphMetrics(`flag${note.dur}Up` as StaffGlyph, note.size).right)
    }
    return laneEntries
  })
  const timed = entries.flatMap(lane => lane.flatMap(entry => entry.notes.map((note, i) => ({ note,
    onset: entry.item.children ? entry.item.onset + i * entry.item.beats / entry.notes.length : entry.item.onset,
    duration: entry.item.children ? entry.item.beats / entry.notes.length : entry.item.beats }))))
  const onsets = [...new Set(timed.map(({ onset }) => Math.round(onset * 1e8) / 1e8))].sort((a, b) => a - b)
  const columns = onsets.map(onset => {
    const notes = timed.filter(value => Math.abs(value.onset - onset) < 1e-7).map(value => value.note)
    const column = { left: 0, after: 0, lyricLeft: 0, lyricAfter: 0 }
    for (const note of notes) {
      const chord = note.item.chord ? measureText(note.item.chord, scoreLayoutConfig.staff.chord / STAFF_SCALE).width / 2 : 0
      column.left = Math.max(column.left, note.left, chord)
      column.after = Math.max(column.after, note.after, chord)
      const center = staffGlyphMetrics(note.head).right / 2
      for (const lyric of note.item.lyrics) {
        if (lyric.kind !== 'text' || !lyric.text.replace(/[\s\u200B\u2800]/g, '')) continue
        const ink = measureText(lyric.text.replaceAll('~', ' '), lyricSpacing.fontSize / STAFF_SCALE)
        const half = ink.width / 2, padding = lyricSpacing.horizontalPadding / STAFF_SCALE
        const underline = lyric.underlined ? style.lyricUnderlineHalfWidth / STAFF_SCALE : 0
        column.lyricLeft = Math.max(column.lyricLeft, half - Math.min(0, ink.left, -underline) - center + padding)
        column.lyricAfter = Math.max(column.lyricAfter, Math.max(half + underline, ink.right - half) + center + padding)
      }
    }
    return column
  })
  const start = Math.max(...signatures.map(s => s.width)) + (staffMusicSize() / 4 * 0.6)
  const endInset = measure.source.right?.startsWith('rpt') ? (staffMusicSize() / 4 * 1.8) : measure.source.right === 'end' ? (staffMusicSize() / 4 * 0.7) : measure.source.right === 'dbl' ? (staffMusicSize() / 4 * 0.4) : 0
  const multiRestWidth = measure.source.interlude ? (staffMusicSize() / 4 * 5.9) : measure.source.multiRest ? Math.max((staffMusicSize() / 4 * 4.3), measureText(String(measure.source.multiRest), scoreLayoutConfig.staff.restCount / STAFF_SCALE, true).width) + (staffMusicSize() / 4 * 1.6) : 0
  const end = Math.max(0, ...timed.map(({ duration, onset }) => onset + duration))
  const weights = onsets.map((onset, i) => Math.sqrt(Math.max(0.125, (onsets[i + 1] ?? end) - onset)))
  return { entries, signatures, beams, metrics: { start, endInset, multiRestWidth, columns }, onsets, weights }
}
export type StaffNoteAnchor = {
  prepared: PreparedNote; x: number; ys: number[]; headLeft: number; headRight: number; direction: number
  stemX: number; stemEnd: number; beam?: StaffBeam
}
export type StaffBeam = { notes: StaffNoteAnchor[]; lane: number }
export type StaffStave = { x: number; y: number; width: number; noteStartX: number }
export type StaffMeasureLayout = {
  prepared: PreparedMeasure; staves: StaffStave[]; entries: Array<Array<{ item: StaffEvent; notes: StaffNoteAnchor[] }>>
  measureText: MeasureText; beams: StaffBeam[]; minimum: number; metrics: StaffMeasureMetrics; start: number; endInset: number; measure: StaffMeasure; spacing: number
}
export function createStaffMeasure(measure: StaffMeasure, first: boolean, hasBass: boolean, measureText: MeasureText, spacing: number, bassY = engine.bassY,
  preparation: StaffPreparation = createStaffPreparation()): StaffMeasureLayout {
  const prepared = preparation.measure(measure, first, hasBass, measureText)
  const entries = prepared.entries.map(lane => lane.map(entry => ({ item: entry.item, notes: entry.notes.map(note => ({
    prepared: note, x: 0, ys: [], headLeft: 0, headRight: 0, direction: note.direction, stemX: 0, stemEnd: 0,
  } as StaffNoteAnchor)) })))
  const beams = prepared.beams.map(beam => ({ lane: beam.lane, notes: beam.indices.map(i => entries[beam.lane]!.flatMap(entry => entry.notes)[i]!) }))
  for (const beam of beams) for (const note of beam.notes) note.beam = beam
  return { prepared, entries, beams, measureText, staves: [0, ...(hasBass ? [bassY] : [])].map(y => ({ x: 0, y, width: 0, noteStartX: 0 })),
    metrics: prepared.metrics, minimum: staffMinimumAtSpacing(prepared.metrics, spacing), start: prepared.metrics.start, endInset: prepared.metrics.endInset, measure, spacing }
}
export function staffLine(x1: number, y1: number, x2: number, y2: number, width = (staffMusicSize() / 4 * 0.1), cls?: string): XmlNode {
  const node = element('path', { stroke: '#000', 'stroke-width': String(width), fill: 'none', ...(cls ? { class: cls } : {}) })
  setNumericPath(node, staffCommandPath([{ kind: 0, values: [x1, y1] }, { kind: 1, values: [x2, y2] }]))
  return node
}
function drawSignature(signature: Signature, x: number, y: number): XmlNode[] {
  return signature.symbols.map(s => {
    const glyph = staffGlyph(s.glyph, x + s.x, y + s.y, s.size)
    return s.glyph === 'gClef' || s.glyph === 'fClef' ? element('g', { class: 'staff-clef' }, [glyph]) : glyph
  })
}
export function drawStaffBar(type: string | undefined, x: number, y: number, left = false): XmlNode {
  const lines: XmlNode[] = [], bar = type ?? (left ? 'invis' : 'single')
  const rule = (dx: number, width = (staffMusicSize() / 4 * 0.1)) => lines.push(staffLine(x + dx, y + staffMusicSize(), x + dx, y + (staffMusicSize() * 2), width))
  if (bar !== 'invis') {
    if (bar === 'dbl') { rule(-(staffMusicSize() / 4 * 0.3)); rule(0) }
    else if (bar === 'end') { rule(-(staffMusicSize() / 4 * 0.5)); rule(-(staffMusicSize() / 4 * 0.1), (staffMusicSize() / 4 * 0.3)) }
    else if (bar.startsWith('rpt')) {
      rule((left ? 1 : -1) * (staffMusicSize() / 4 * 0.1), (staffMusicSize() / 4 * 0.3)); rule((left ? 1 : -1) * (staffMusicSize() / 4 * 0.6))
      for (const sign of bar === 'rptboth' ? [-1, 1] : [left ? 1 : -1]) for (const dy of [(staffMusicSize() * 1.5) - (staffMusicSize() / 8), (staffMusicSize() * 1.5) + (staffMusicSize() / 8)])
        lines.push(staffGlyph('repeatDot', x + sign * (staffMusicSize() / 4 * 1.2) - (staffMusicSize() / 4 * 0.15), y + dy))
    } else rule(0)
  }
  return element('g', { class: 'staff-bar' }, lines)
}
function positionNote(note: StaffNoteAnchor, x: number, y: number) {
  const p = note.prepared
  note.x = x; note.direction = p.direction
  note.ys = p.heads.map(h => y + h.y)
  note.headLeft = x + Math.min(...p.heads.map(h => h.x))
  note.headRight = x + Math.max(...p.heads.map(h => h.x)) + staffGlyphMetrics(p.head, p.size).right
  const mainWidth = staffGlyphMetrics(p.head, p.size).right
  note.stemX = x + (p.direction === 1 ? mainWidth - (staffMusicSize() / 4 * 0.06) : (staffMusicSize() / 4 * 0.06))
  const outer = p.direction === 1 ? Math.min(...note.ys) : Math.max(...note.ys)
  note.stemEnd = outer - p.direction * Math.max(p.size * 0.875, p.size * 0.625 + Math.max(0, Math.log2(p.dur / 8)) * (staffMusicSize() / 4 * 0.5))
}
function drawNote(note: StaffNoteAnchor, staveY: number, grace = false): XmlNode[] {
  const p = note.prepared, size = p.size, result: XmlNode[] = []
  if (p.signature.width) result.push(element('g', { class: 'inline-signature' }, drawSignature(p.signature, note.x - p.left, staveY)))
  if (!p.rest) {
    const ledger = new Map<number, { left: number; right: number }>()
    for (const head of p.heads) {
      const add = (y: number) => {
        const old = ledger.get(y), left = note.x + head.x - (staffMusicSize() / 4 * 0.3), right = note.x + head.x + staffGlyphMetrics(p.head, size).right + (staffMusicSize() / 4 * 0.3)
        ledger.set(y, { left: Math.min(old?.left ?? left, left), right: Math.max(old?.right ?? right, right) })
      }
      for (let y = staffMusicSize() - (staffMusicSize() / 4); y >= head.y; y -= (staffMusicSize() / 4)) add(y)
      for (let y = (staffMusicSize() * 2) + (staffMusicSize() / 4); y <= head.y; y += (staffMusicSize() / 4)) add(y)
    }
    for (const [y, { left, right }] of ledger) result.push(staffLine(left, staveY + y, right, staveY + y, (staffMusicSize() / 4 * 0.1), 'ledger-line'))
  }
  for (const head of p.heads) result.push(element('g', { class: p.rest ? 'rest-symbol' : 'notehead' }, [staffGlyph(p.head, note.x + head.x, staveY + head.y + (p.rest && p.dur === 1 ? -(staffMusicSize() / 4) : 0), size)]))
  if (!p.rest && p.dur > 1) {
    const root = p.direction === 1 ? Math.max(...note.ys) - (staffMusicSize() / 4 * 0.1) : Math.min(...note.ys) + (staffMusicSize() / 4 * 0.1)
    result.push(staffLine(note.stemX, root, note.stemX, note.stemEnd, grace ? (staffMusicSize() / 4 * 0.1) : (staffMusicSize() / 4 * 0.12), 'stem'))
    if (p.dur >= 8 && !note.beam) result.push(staffGlyph(`flag${p.dur}${p.direction === 1 ? 'Up' : 'Down'}` as StaffGlyph, note.stemX, note.stemEnd, size))
  }
  const markShift = !p.rest && p.dur > 1 && p.direction === 1
    ? Math.min(0, note.stemEnd - (staffMusicSize() / 4 * 0.6) - (staveY + Math.min(staffMusicSize(), ...p.heads.map(head => head.y)) - (staffMusicSize() / 4 * 1))) : 0
  result.push(...p.symbols.map(s => staffGlyph(s.glyph, note.x + s.x, staveY + s.y +
    (s.glyph.startsWith('accidental') || s.glyph === 'augmentationDot' ? 0 : markShift), s.size ?? size)))
  if (p.item.event.postfixes.includes('arp')) {
    const x = note.x - p.left + p.signature.width + (p.signature.width ? (staffMusicSize() / 4 * 0.6) : 0) + p.graceWidth + (staffMusicSize() / 4 * 0.2)
    const top = Math.min(...note.ys) - (staffMusicSize() / 4 * 0.5), bottom = Math.max(...note.ys) + (staffMusicSize() / 4 * 0.5)
    const step = staffGlyphMetrics('wiggleArpeggiatoUp', (style.music * .7) / STAFF_SCALE).advance, wave: XmlNode[] = []
    for (let y = top; y < bottom; y += step) {
      const glyph = staffGlyph('wiggleArpeggiatoUp', 0, 0, (style.music * .7) / STAFF_SCALE)
      glyph.attributes.transform = `translate(${x} ${y}) rotate(90)`
      wave.push(glyph)
    }
    result.push(element('g', { class: 'arpeg' }, wave))
  }
  for (const child of p.graces) {
    const anchor: StaffNoteAnchor = { prepared: child.note, x: 0, ys: [], headLeft: 0, headRight: 0, direction: 1, stemX: 0, stemEnd: 0 }
    positionNote(anchor, note.x - p.left + p.signature.width + (p.signature.width ? (staffMusicSize() / 4 * 0.6) : 0) + child.x, staveY)
    result.push(element('g', { class: 'grace' }, drawNote(anchor, staveY, true)))
    if (child.slash) result.push(staffLine(anchor.stemX - (staffMusicSize() / 4 * 0.4), anchor.stemEnd + (staffMusicSize() / 4 * 1.5), anchor.stemX + (staffMusicSize() / 4 * 0.7), anchor.stemEnd + (staffMusicSize() / 4 * 0.5)))
  }
  return result
}
function positionBeam(beam: StaffBeam) {
  const first = beam.notes[0]!, last = beam.notes.at(-1)!, direction = first.direction
  const dx = last.stemX - first.stemX
  const slope = dx ? Math.max(-0.2, Math.min(0.2, (last.stemEnd - first.stemEnd) / dx)) : 0
  // Keep the ordinary stem length on average. Requiring that full length
  // at every extreme of a leap makes all the other stems needlessly long.
  let origin = beam.notes.reduce((sum, note) => sum + note.stemEnd - slope * (note.stemX - first.stemX), 0) / beam.notes.length
  for (const note of beam.notes) {
    const levels = Math.log2(note.prepared.dur / 4)
    const minimum = (staffMusicSize() / 4) * Math.max(2.5, (levels - 1) * .7 + .4 + 1)
    const outer = direction === 1 ? Math.min(...note.ys) : Math.max(...note.ys)
    const required = outer - direction * minimum - slope * (note.stemX - first.stemX)
    origin = direction === 1 ? Math.min(origin, required) : Math.max(origin, required)
  }
  for (const note of beam.notes) note.stemEnd = origin + slope * (note.stemX - first.stemX)
}
function drawBeam(beam: StaffBeam): XmlNode {
  const notes = beam.notes, direction = notes[0]!.direction
  const max = Math.max(...notes.map(n => Math.log2(n.prepared.dur / 4)))
  const shapes: XmlNode[] = []
  for (let level = 1; level <= max; level++) {
    let index = 0
    while (index < notes.length) {
      if (Math.log2(notes[index]!.prepared.dur / 4) < level) { index++; continue }
      const start = index++
      while (index < notes.length && Math.log2(notes[index]!.prepared.dur / 4) >= level) index++
      const a = notes[start]!, b = notes[index - 1]!
      const x1 = a.stemX, offset = direction * (level - 1) * (staffMusicSize() / 4 * 0.7)
      const y1 = a.stemEnd + offset
      let x2 = b.stemX, y2 = b.stemEnd + offset
      if (a === b) {
        const neighbor = notes[start + 1] ?? notes[start - 1]!
        x2 = x1 + Math.sign(neighbor.stemX - x1) * Math.min((staffMusicSize() / 4 * 1), Math.abs(neighbor.stemX - x1) / 2)
        y2 = y1 + (neighbor.stemEnd - a.stemEnd) * (x2 - x1) / (neighbor.stemX - x1)
      }
      const path = element('path', { fill: '#000', stroke: 'none' })
      setNumericPath(path, staffCommandPath([{ kind: 0, values: [x1, y1] }, { kind: 1, values: [x2, y2] },
        { kind: 1, values: [x2, y2 + direction * (staffMusicSize() / 4 * 0.4)] }, { kind: 1, values: [x1, y1 + direction * (staffMusicSize() / 4 * 0.4)] }, { kind: 4, values: [] }]))
      shapes.push(path)
    }
  }
  return element('g', { class: 'beam' }, shapes)
}
function drawTuplet(notes: StaffNoteAnchor[], item: StaffEvent, staveY: number, measureText: MeasureText): XmlNode {
  const pitched = notes.find(n => !n.prepared.rest), below = pitched?.direction === -1
  const first = notes[0]!, last = notes.at(-1)!
  const y = below ? Math.max(staveY + (staffMusicSize() / 4 * 10.5), ...notes.map(n => Math.max(...n.ys, n.stemEnd) + (staffMusicSize() / 4 * 1.8)))
    : Math.min(staveY + (staffMusicSize() / 4 * 2.5), ...notes.map(n => Math.min(...n.ys, n.stemEnd) - (staffMusicSize() / 4 * 1.2)))
  const tuplet = item.event.tuplet!, ratio = tuplet.numbase !== 2 ** Math.floor(Math.log2(tuplet.num))
  const label = ratio ? `${tuplet.num}:${tuplet.numbase}` : String(tuplet.num)
  const cx = (first.headLeft + last.headRight) / 2, labelWidth = measureText(label, (style.music * .4) / STAFF_SCALE).width
  const children: XmlNode[] = [element('text', { x: String(cx), y: String(y), 'font-size': String((style.music * .4) / STAFF_SCALE), 'text-anchor': 'middle', 'font-family': SCORE_TEXT_FONT }, [label])]
  if (!first.beam || notes.some(note => !note.beam || note.beam !== first.beam)) {
    const lineY = y - (staffMusicSize() / 4 * 0.5), hook = (below ? -1 : 1) * (staffMusicSize() / 4 * 0.5)
    children.push(staffLine(first.headLeft, lineY + hook, first.headLeft, lineY),
      staffLine(first.headLeft, lineY, cx - labelWidth / 2 - (staffMusicSize() / 4 * 0.3), lineY),
      staffLine(cx + labelWidth / 2 + (staffMusicSize() / 4 * 0.3), lineY, last.headRight, lineY),
      staffLine(last.headRight, lineY, last.headRight, lineY + hook))
  }
  return element('g', { class: 'm3n-tuplet-label', 'data-m3n-below': String(below) }, [element('g', { class: 'tupletNum' }, children)])
}
export function drawStaffMeasure(model: StaffMeasureLayout, width: number, x: number): XmlNode {
  const { prepared } = model
  const extra = Math.max(0, width - model.minimum), weight = prepared.weights.reduce((sum, n) => sum + n, 0)
  let right = 0, cumulative = 0
  const positions = prepared.metrics.columns.map((column, i) => {
    const insets = columnInsets(column, i === 0, model.spacing * engine.spacingUnit / STAFF_SCALE)
    const position = x + model.start + right + insets.left + extra * cumulative / (weight || 1)
    right += insets.left + insets.after; cumulative += prepared.weights[i]!
    return position
  })
  for (const [lane, stave] of model.staves.entries()) {
    stave.x = x; stave.width = width; stave.noteStartX = x + model.start
    for (const entry of model.entries[lane]!) for (const [i, note] of entry.notes.entries()) {
      const onset = entry.item.children ? entry.item.onset + i * entry.item.beats / entry.notes.length : entry.item.onset
      const column = prepared.onsets.findIndex(value => Math.abs(value - onset) < 1e-7)
      positionNote(note, positions[column]!, stave.y)
    }
  }
  model.beams.forEach(positionBeam)
  const measureNode = element('g', { id: model.measure.id, class: 'measure' })
  for (const [lane, stave] of model.staves.entries()) {
    const staff = element('g', { class: 'staff', 'data-staff': lane ? 'bass' : 'melody' })
    for (let i = 0; i < 5; i++) staff.children.push(staffLine(x, stave.y + staffMusicSize() + (staffMusicSize() / 4) * i, x + width, stave.y + staffMusicSize() + (staffMusicSize() / 4) * i, (staffMusicSize() / 4 * 0.1), 'staff-line'))
    staff.children.push(drawStaffBar(model.measure.source.left, x, stave.y, true), drawStaffBar(model.measure.source.right, x + width, stave.y),
      ...drawSignature(prepared.signatures[lane]!, x, stave.y))
    for (const entry of model.entries[lane]!) {
      const attrs: Record<string, string> = { id: entry.item.id, class: entry.item.event.kind }
      if (/-rend\d+$/.test(entry.item.id)) {
        attrs['data-m3n-id'] = entry.item.id.replace(/-rend\d+$/, '')
        attrs['data-m3n-passes'] = /-rend(\d+)$/.exec(entry.item.id)![1]!
      }
      const event = element('g', attrs)
      for (const [i, note] of entry.notes.entries()) {
        const music = drawNote(note, stave.y)
        if (entry.item.children) event.children.push(element('g', { id: entry.item.children[i]!.id, class: entry.item.children[i]!.event.kind }, music))
        else event.children.push(...music)
      }
      staff.children.push(event)
      if (entry.item.children && entry.item.event.tuplet) staff.children.push(drawTuplet(entry.notes, entry.item, stave.y, model.measureText))
    }
    for (const beam of model.beams.filter(beam => beam.lane === lane)) staff.children.push(drawBeam(beam))
    measureNode.children.push(staff)
  }
  return measureNode
}
/** Open ties use system boundaries; one ribbon is drawn for each chord member. */
export function drawStaffTie(first: StaffNoteAnchor | undefined, last: StaffNoteAnchor | undefined, left: number, right: number): XmlNode[] {
  const note = first ?? last!
  const direction = -note.direction, count = Math.min(first?.ys.length ?? Infinity, last?.ys.length ?? Infinity)
  const curves: XmlNode[] = []
  for (let i = 0; i < count; i++) {
    const x1 = first ? first.headRight + (staffMusicSize() / 4 * 0.1) : left, x2 = last ? last.headLeft - (staffMusicSize() / 4 * 0.1) : right
    const y1 = (first?.ys[i] ?? last!.ys[i]!) + direction * (staffMusicSize() / 4 * 0.6), y2 = (last?.ys[i] ?? first!.ys[i]!) + direction * (staffMusicSize() / 4 * 0.6)
    const height = direction * Math.min((staffMusicSize() / 4 * 1.6), Math.max((staffMusicSize() / 4 * 0.6), (x2 - x1) / 6)), dx = (x2 - x1) / 3
    const path = element('path', { fill: '#000', stroke: 'none' })
    setNumericPath(path, staffCommandPath([{ kind: 0, values: [x1, y1] },
      { kind: 3, values: [x1 + dx, y1 + height, x2 - dx, y2 + height, x2, y2] },
      { kind: 3, values: [x2 - dx, y2 + height - direction * (staffMusicSize() / 4 * 0.15), x1 + dx, y1 + height - direction * (staffMusicSize() / 4 * 0.15), x1, y1] }, { kind: 4, values: [] }]))
    curves.push(path)
  }
  return curves
}
