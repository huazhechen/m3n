import { SCORE_TEXT_FONT, lyricSpacing, hasLyricHyphen, lyricHyphenAdvance, scoreLayoutConfig, scoreAttachmentHeight, solveScoreSpacing, scoreRhythmicGapWeight, scoreReadingWindows } from '@m3n/numbered-notation'
import type { StaffDocument, StaffEvent, StaffMeasure } from './staff-document.js'
import { element, setNumericPath, type Ink, type MeasureText, type XmlNode } from './layout-svg.js'
import type { StaffLyricText } from './staff-lyric-drawing.js'
import { staffCommandPath, staffLinePath } from './staff-glyph-primitive.js'
import { staffMusicSize, staffGlyph, staffGlyphMetrics, staffCharacterInk, staffGlyphCharacter, staffSignatureAdvance, type StaffGlyph } from './staff-music-font.js'

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
  ties?: ReadonlyArray<{ start: number; end: number; minimum: number }>
  tieLeading?: number; tieTrailing?: number
  columns: ReadonlyArray<{ left: number; after: number; lyricLeft: number; lyricAfter: number; rhythmLeft: number; rhythmAfter: number; naturalAdvance: number; lyricRows: Array<{ lane: string; left: number; after: number }> }>
}
/** Hard rhythmic minima followed only by nonnegative stretching. */
const spacingBases = new WeakMap<PreparedMeasure, Map<number, {
  positions: readonly number[]; weights: number[]; total: number; correction: number
}>>()
export function staffSpacingPositions(prepared: PreparedMeasure, spacing: number, extra: number) {
  let variants = spacingBases.get(prepared)
  if (!variants) { variants = new Map(); spacingBases.set(prepared, variants) }
  let basis = variants.get(spacing)
  if (!basis) {
    const base = staffColumnSpacing(prepared.metrics, spacing)
    const edgeWeight = (prepared.weights.at(-1) ?? 1) / 2
    const weights = [edgeWeight, ...prepared.weights.slice(0, -1), edgeWeight]
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    const occupied = prepared.metrics.start + base.minimumWidth + staffMusicSize() / 4 + prepared.metrics.endInset
    basis = { positions: base.positions, weights, total,
      correction: Math.max(0, staffMinimumAtSpacing(prepared.metrics, spacing) - occupied) }
    variants.set(spacing, basis)
  }
  const { weights, total } = basis
  const surplus = Math.max(0, extra) + basis.correction
  let offset = total > 0 ? surplus * weights[0]! / total : 0
  const positions = basis.positions.map((position, index) => {
    const value = position + offset
    offset += total > 0 ? surplus * weights[index + 1]! / total : 0
    return value
  })
  return positions
}
export function staffReadingSpacing(prepared: PreparedMeasure, spacing: number, extra: number) {
  const positions = staffSpacingPositions(prepared, spacing, extra)
  const reading = scoreReadingWindows(positions.map((x, index) => ({ beat: prepared.onsets[index]!, x,
    preferredNext: prepared.metrics.columns[index]!.naturalAdvance })))
  return { positions, reading, compressionPenalty: 0 }
}
/** Final physical whitespace / shared directional pair weights, in logical px.
 * Boundary springs represent the last event's duration, not a free extra gap. */
export function staffRhythmicSpacing(prepared: PreparedMeasure, spacing: number, extra: number) {
  const positions = staffSpacingPositions(prepared, spacing, extra)
  const head = staffGlyphMetrics('noteheadBlack'), headWidth = head.right - head.left
  const increment = staffMusicSize() / 4 * style.spacingIncrementSpaces
  let gap = 0, weight = 0
  for (let i = 0; i + 1 < positions.length; i++) {
    const durationWeight = Math.max(0, (prepared.metrics.columns[i]!.naturalAdvance - headWidth) / increment)
    if (!durationWeight) continue
    gap += Math.max(0, positions[i + 1]! - positions[i]! - prepared.metrics.columns[i]!.after - prepared.metrics.columns[i + 1]!.left)
    weight += durationWeight
  }
  // The two boundary springs together hold the duration of the final event.
  const finalWeight = prepared.weights.at(-1) ?? 0
  if (finalWeight > 0 && positions.length) {
    const minimum = staffMinimumAtSpacing(prepared.metrics, spacing)
    const end = minimum + Math.max(0, extra) - prepared.metrics.endInset
    gap += Math.max(0, positions[0]!) + Math.max(0, end - prepared.metrics.start - positions.at(-1)! - headWidth)
    weight += finalWeight
  }
  return { gap: gap * STAFF_SCALE, weight }
}
export function staffMinimumAtSpacing(metrics: StaffMeasureMetrics, spacing: number, _reading = false): number {
  const right = staffColumnSpacing(metrics, spacing).minimumWidth
  return Math.max(engine.minimumMeasureWidth, metrics.start + right + staffMusicSize() / 4 + metrics.endInset,
    metrics.start + metrics.multiRestWidth + (metrics.multiRestWidth ? metrics.endInset : 0))
}
const columnSpacings = new WeakMap<StaffMeasureMetrics, Map<string, ReturnType<typeof solveScoreSpacing>>>()
function staffColumnSpacing(metrics: StaffMeasureMetrics, spacing: number, reading = false) {
  let variants = columnSpacings.get(metrics)
  if (!variants) { variants = new Map(); columnSpacings.set(metrics, variants) }
  const key = `${spacing}:${reading}`
  let solution = variants.get(key)
  if (!solution) {
    const ordinaryHead = staffGlyphMetrics('noteheadBlack')
    const headWidth = ordinaryHead.right - ordinaryHead.left
    const increment = staffMusicSize() / 4 * style.spacingIncrementSpaces
    solution = solveScoreSpacing(metrics.columns.map((column, index) => {
      const after = Math.max(0, (column.naturalAdvance - headWidth) / increment)
      const gap = staffMusicSize() / 4 * spacing
      // Physical music ink plus the shared pair clearance; lyrics are a
      // parallel constraint, never an additional rhythmic width.
      const inkGap = staffMusicSize() / 4 * .2
      return { cells: [
        { lane: 'music', left: index === 0 ? Math.max(column.left, metrics.tieLeading ?? 0) : column.left,
          right: Math.max(column.after, index + 1 === metrics.columns.length ? metrics.tieTrailing ?? 0 : 0) + (index + 1 < metrics.columns.length ? Math.max(inkGap, gap * after) : 0), before: 0, after: 0 },
        ...(metrics.ties ?? []).flatMap((tie, i) => index === tie.start || index === tie.end
          ? [{ lane: `tie-${i}`, sparse: true, left: 0, right: index === tie.start ? tie.minimum : 0,
            before: 0, after: 0, beforeStretch: 0, afterStretch: 0 }] : []),
        ...column.lyricRows.map(row => ({ lane: row.lane, sparse: true, left: row.left, right: row.after, before: 0, after: 0 })),
      ] }
    }))
    variants.set(key, solution)
  }
  return solution
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
  const rows = [count, unit].map(value => {
    let x = 0
    const digits = [...String(value)].map(digit => {
      const glyph = `time${digit}` as StaffGlyph, metrics = staffGlyphMetrics(glyph)
      const symbol = { glyph, x, y: 0 }
      x += metrics.advance
      return { symbol, metrics }
    })
    const left = Math.min(...digits.map(({ symbol, metrics }) => symbol.x + metrics.left))
    const right = Math.max(...digits.map(({ symbol, metrics }) => symbol.x + metrics.right))
    const top = Math.min(...digits.map(({ metrics }) => metrics.top))
    const bottom = Math.max(...digits.map(({ metrics }) => metrics.bottom))
    return { digits, left, width: right - left, centerY: (top + bottom) / 2 }
  })
  const width = Math.max(...rows.map(row => row.width))
  for (const [index, row] of rows.entries()) for (const { symbol } of row.digits) {
    symbols.push({ ...symbol, x: symbol.x + (width - row.width) / 2 - row.left,
      y: staffMusicSize() * (index ? 1.75 : 1.25) - row.centerY })
  }
  // SMuFL time digits are centred on their origin, unlike ordinary text.
  // Centre the complete painted fraction on the middle staff line as well.
  const top = Math.min(...symbols.map(s => s.y + staffGlyphMetrics(s.glyph).top))
  const bottom = Math.max(...symbols.map(s => s.y + staffGlyphMetrics(s.glyph).bottom))
  const dy = staffMusicSize() * 1.5 - (top + bottom) / 2
  for (const symbol of symbols) symbol.y += dy
  return { symbols, width: width + staffMusicSize() / 4 * .6 }
}
function appendSignature(target: Signature, next: Signature) {
  target.symbols.push(...next.symbols.map(symbol => ({ ...symbol, x: symbol.x + target.width })))
  target.width += next.width
}
type Head = { x: number; y: number }
export type PreparedNote = {
  item: StaffEvent; dur: number; dots: number; size: number; rest: boolean; direction: number; head: StaffGlyph
  heads: Head[]; symbols: SymbolPlacement[]; left: number; after: number; signature: Signature
  graces: Array<{ note: PreparedNote; x: number; slash: boolean; group: number }>; graceWidth: number
}
type PreparedEntry = { item: StaffEvent; notes: PreparedNote[] }
export type PreparedMeasure = { entries: PreparedEntry[][]; metrics: StaffMeasureMetrics; signatures: Signature[]; onsets: number[]; weights: number[]; beams: Array<{ lane: number; indices: number[] }> }
/** Only immutable local descriptors belong to a task; candidate anchors are fresh. */
export function createStaffPreparation(document?: StaffDocument) {
  const incomingTies = new Set<string>()
  for (const lane of ['melody', 'bass'] as const) {
    let previous: StaffEvent | undefined
    for (const measure of document?.measures ?? []) for (const entry of measure[lane]) {
      if (previous?.event.tie) incomingTies.add(entry.children?.[0]?.id ?? entry.id)
      previous = entry
    }
  }
  const measures = new WeakMap<StaffMeasure, Map<string, PreparedMeasure>>()
  return {
    lyricAttributes: new WeakMap<StaffEvent, Array<Record<string, string>>>(), lyricTexts: new Map<string, StaffLyricText>(),
    measure(measure: StaffMeasure, first: boolean, hasBass: boolean, measureText: MeasureText) {
      let variants = measures.get(measure)
      if (!variants) { variants = new Map(); measures.set(measure, variants) }
      const key = `${first}:${hasBass}`
      let prepared = variants.get(key)
      if (!prepared) { prepared = prepareMeasure(measure, first, hasBass, measureText, incomingTies); variants.set(key, prepared) }
      return prepared
    },
  }
}
export type StaffPreparation = ReturnType<typeof createStaffPreparation>
const marks: Record<string, StaffGlyph> = { str: 'articAccentAbove', tip: 'articStaccatoAbove', brk: 'articStaccatissimoAbove', hold: 'articTenutoAbove', fermata: 'fermataAbove', breath: 'breathMarkComma', tr: 'ornamentTrill', prall: 'ornamentShortTrill' }
function prepareNote(item: StaffEvent, bass: boolean, accidentalState: Map<string, string>, key: string, grace = false, beamedGrace = false): PreparedNote {
  const { dur, dots } = staffDuration(item.beats), rest = item.event.kind === 'rest'
  const ys = rest ? [(staffMusicSize() * 1.5)] : item.pitches.map(p => staffPitchY(p.key, bass))
  const direction = grace || rest || ys.reduce((sum, y) => sum + y, 0) / ys.length > (staffMusicSize() * 1.5) ? 1 : -1
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
  if (!grace) for (const [groupIndex, group] of (item.graces ?? []).entries()) for (const [pitchIndex, pitch] of group.pitches.entries()) {
    const child = { ...item, pitches: [pitch], beats: 4 / group.duration, graces: [], lyrics: [], event: { ...item.event, kind: 'note' as const, postfixes: [] } }
    const note = prepareNote(child, bass, accidentalState, key, true, group.pitches.length > 1)
    graces.push({ note, x: graceWidth + note.left, slash: group.slash && pitchIndex === 0, group: groupIndex }); graceWidth += note.left + note.after + note.size / 4 * .5
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
  // Host flags are measured after beam membership is known; only single graces need flags.
  if (grace && !beamedGrace && !rest && dur >= 8) after = Math.max(after, headWidth + staffGlyphMetrics(`flag${dur}Up` as StaffGlyph, size).right)
  if (grace && !rest && ys.some(y => y <= staffMusicSize() - staffMusicSize() / 4 || y >= staffMusicSize() * 2 + staffMusicSize() / 4)) {
    left = Math.max(left, size / 4 * .35)
    after = Math.max(after, headWidth + size / 4 * .35)
  }
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
function prepareMeasure(measure: StaffMeasure, first: boolean, hasBass: boolean, measureText: MeasureText, incomingTies: ReadonlySet<string>): PreparedMeasure {
  const signatures: Signature[] = [], beams: PreparedMeasure['beams'] = []
  const entries = [measure.melody, ...(hasBass ? [measure.bass] : [])].map((items, lane) => {
    const bass = lane === 1, signature: Signature = { symbols: [], width: 0 }
    if (first) {
      const glyph = bass ? 'fClef' : 'gClef', m = staffGlyphMetrics(glyph)
      appendSignature(signature, { symbols: [{ glyph, x: -m.left, y: bass ? (staffMusicSize() / 4) * 5 : (staffMusicSize() / 4) * 7 }], width: m.right - m.left + (staffMusicSize() / 4 * 1) })
    }
    if (first || measure.key !== measure.previousKey) appendSignature(signature, keySignature(measure.key, first ? undefined : measure.previousKey, bass))
    if (measure.showMeter) appendSignature(signature, meterSignature(measure.meterCount, measure.meterUnit))
    // Mid-system signatures share their origin with the preceding measure's
    // closing bar. Reserve real ink clearance before the first glyph as well
    // as after the signature; the same width feeds line planning and drawing.
    if (!first && signature.symbols.length) {
      const inset = measure.joinsPreviousRepeat
        ? staffMusicSize() / 4 * 1.05 + staffGlyphMetrics('repeatDot').right + staffMusicSize() / 4
        : staffMusicSize() / 4 * .55
      for (const symbol of signature.symbols) symbol.x += inset
      signature.width += inset
    }
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
      const flag = staffGlyphMetrics(`flag${note.dur}${note.direction === 1 ? 'Up' : 'Down'}` as StaffGlyph, note.size)
      const stemX = note.direction === 1 ? head.right - note.size / 4 * .06 : note.size / 4 * .06
      note.left = Math.max(note.left, -stemX - flag.left)
      note.after = Math.max(note.after, stemX + flag.right)
    }
    return laneEntries
  })
  const timed = entries.flatMap((lane, laneIndex) => lane.flatMap(entry => entry.notes.map((note, i) => ({ note, laneIndex,
    onset: entry.item.children ? entry.item.onset + i * entry.item.beats / entry.notes.length : entry.item.onset,
    duration: entry.item.children ? entry.item.beats / entry.notes.length : entry.item.beats }))))
  const onsets = [...new Set(timed.map(({ onset }) => Math.round(onset * 1e8) / 1e8))].sort((a, b) => a - b)
  const beamFor = new Map<PreparedNote, object>()
  for (const beam of beams) {
    const flat = entries[beam.lane]!.flatMap(entry => entry.notes)
    for (const index of beam.indices) beamFor.set(flat[index]!, beam)
  }
  const columns = onsets.map((onset, onsetIndex) => {
    const notes = timed.filter(value => Math.abs(value.onset - onset) < 1e-7)
    const column = { left: 0, after: 0, lyricLeft: 0, lyricAfter: 0, rhythmLeft: 0, rhythmAfter: 0, naturalAdvance: 0, lyricRows: [] as Array<{ lane: string; left: number; after: number }> }
    for (const { note, laneIndex } of notes) {
      const chord = note.item.chord ? measureText(note.item.chord, scoreLayoutConfig.staff.chord / STAFF_SCALE).width / 2 : 0
      column.left = Math.max(column.left, note.left, chord)
      column.after = Math.max(column.after, note.after, chord)
      // Ledger rules project past the head. The old generous constant gap
      // hid this ink; rhythmic tightening must reserve the visible rules.
      if (!note.rest) {
        const space = staffMusicSize() / 4
        const ledgerHeads = note.heads.filter(head => head.y <= staffMusicSize() - space || head.y >= staffMusicSize() * 2 + space)
        for (const head of ledgerHeads) {
          column.left = Math.max(column.left, -head.x + space * .35)
          column.after = Math.max(column.after, head.x + staffGlyphMetrics(note.head, note.size).right + space * .35)
        }
      }
      const center = staffGlyphMetrics(note.head).right / 2
      for (const lyric of note.item.lyrics) {
        if (lyric.kind !== 'text' || !lyric.text.replace(/[\s\u200B\u2800]/g, '')) continue
        const ink = measureText(lyric.text.replaceAll('~', ' '), lyricSpacing.fontSize / STAFF_SCALE)
        const half = ink.width / 2, padding = lyricSpacing.horizontalPadding / STAFF_SCALE
        const underline = lyric.underlined ? style.lyricUnderlineHalfWidth / STAFF_SCALE : 0
        const left = half - Math.min(0, ink.left, -underline) - center + padding
        const after = Math.max(half + underline, ink.right - half) + center + padding
          + (hasLyricHyphen(lyric) ? lyricHyphenAdvance(lyricSpacing.fontSize) / STAFF_SCALE : 0)
        column.lyricLeft = Math.max(column.lyricLeft, left)
        column.lyricAfter = Math.max(column.lyricAfter, after)
        const lane = `lyrics-${laneIndex}-${lyric.verseIndex}`
        const row = column.lyricRows.find(row => row.lane === lane)
        if (row) { row.left = Math.max(row.left, left); row.after = Math.max(row.after, after) }
        else column.lyricRows.push({ lane, left, after })
      }
    }
    const ordinaryHead = staffGlyphMetrics('noteheadBlack')
    const end = Math.max(...timed.map(value => value.onset + value.duration))
    const duration = (onsets[onsetIndex + 1] ?? end) - onset
    const nextOnset = onsets[onsetIndex + 1]
    const nextDuration = nextOnset === undefined ? undefined : (onsets[onsetIndex + 2] ?? end) - nextOnset
    const nextNotes = timed.filter(value => Math.abs(value.onset - (nextOnset ?? Infinity)) < 1e-7)
    // Shared time columns stay aligned. Tighten only if every attacking
    // voice continues into the next column through its own common beam.
    const grouped = notes.length > 0 && notes.every(value => {
      const next = nextNotes.find(other => other.laneIndex === value.laneIndex)
      if (!next) return false
      return beamFor.has(value.note) && beamFor.get(value.note) === beamFor.get(next.note)
    })
    const weight = scoreRhythmicGapWeight(duration, nextDuration, grouped ? style.groupSpacingRatio : 1)
    column.naturalAdvance = ordinaryHead.right - ordinaryHead.left
      + weight * staffMusicSize() / 4 * style.spacingIncrementSpaces
    column.rhythmLeft = (ordinaryHead.right - ordinaryHead.left) / 2
    column.rhythmAfter = Math.max(0, column.naturalAdvance - column.rhythmLeft)
    return column
  })
  // Tie readability is a sparse hard constraint on the same shared column
  // solver as music and lyrics; it never changes rhythm/stretch weights.
  const ties: Array<{ start: number; end: number; minimum: number }> = []
  const noteColumns = new Map(timed.map(value => [value.note, onsets.findIndex(onset => Math.abs(onset - value.onset) < 1e-7)]))
  const columnFor = (note: PreparedNote) => noteColumns.get(note)!
  const tieMinimum = staffMusicSize() / 4
  const reserve = (a: PreparedNote, b: PreparedNote) => {
    const minimum = Math.max(...a.heads.slice(0, b.heads.length).map((_, i) =>
      staffTiePorts(a, i).start - staffTiePorts(b, i, -a.direction).end + tieMinimum))
    if (Number.isFinite(minimum)) ties.push({ start: columnFor(a), end: columnFor(b), minimum })
  }
  let tieLeading = 0, tieTrailing = 0
  for (const lane of entries) {
    let previous: PreparedEntry | undefined
    for (const entry of lane) {
      if (previous?.item.event.tie) reserve(previous.notes.at(-1)!, entry.notes[0]!)
      for (const slot of entry.item.event.tupletTies ?? [])
        if (entry.notes[slot] && entry.notes[slot + 1]) reserve(entry.notes[slot]!, entry.notes[slot + 1]!)
      previous = entry
    }
    const firstNote = lane[0]?.notes[0], lastEntry = lane.at(-1), lastNote = lastEntry?.notes.at(-1)
    if (first && firstNote && incomingTies.has(firstNote.item.id))
      tieLeading = Math.max(tieLeading, ...firstNote.heads.map((_, i) => tieMinimum - staffTiePorts(firstNote, i).end))
    if (lastNote && lastEntry!.item.event.tie)
      tieTrailing = Math.max(tieTrailing, ...lastNote.heads.map((_, i) => staffTiePorts(lastNote, i).start + tieMinimum))
  }
  const startGap = staffMusicSize() / 4
  const joined = Boolean(measure.joinsPreviousRepeat && !first)
  const start = measure.source.left?.startsWith('rpt') && !joined
    ? repeatBarOffset(signatures) + staffMusicSize() / 4 * 1.05 + staffGlyphMetrics('repeatDot').right + startGap
    : Math.max(...signatures.map(s => s.width)) + startGap
      + (joined && signatures.every(s => !s.symbols.length)
        ? staffMusicSize() / 4 * 1.05 + staffGlyphMetrics('repeatDot').right
        : !first && signatures.every(s => !s.symbols.length) ? staffMusicSize() / 4 * .05 : 0)
  const endInset = measure.source.right?.startsWith('rpt') ? staffMusicSize() / 4 * 1.35 - staffGlyphMetrics('repeatDot').left : staffMusicSize() / 4 * (measure.source.right === 'end' ? .55 : measure.source.right === 'dbl' ? .35 : measure.source.right === 'invis' ? 0 : .05)
  const multiRestWidth = measure.source.interlude ? (staffMusicSize() / 4 * 5.9) : measure.source.multiRest ? Math.max((staffMusicSize() / 4 * 4.3), measureText(String(measure.source.multiRest), scoreLayoutConfig.staff.restCount / STAFF_SCALE, true).width) + (staffMusicSize() / 4 * 1.6) : 0
  const headWidth = staffGlyphMetrics('noteheadBlack').right - staffGlyphMetrics('noteheadBlack').left
  const increment = staffMusicSize() / 4 * style.spacingIncrementSpaces
  const weights = columns.map(column => Math.max(0, (column.naturalAdvance - headWidth) / increment))
  return { entries, signatures, beams, metrics: { start, endInset, multiRestWidth, columns, ties, tieLeading, tieTrailing }, onsets, weights }
}
export type StaffNoteAnchor = {
  prepared: PreparedNote; x: number; ys: number[]; headLeft: number; headRight: number; direction: number
  durationEndX?: number
  stemX: number; stemEnd: number; beam?: StaffBeam
}
export type StaffBeam = { notes: StaffNoteAnchor[]; lane: number }
export type StaffStave = { x: number; y: number; width: number; noteStartX: number }
export type StaffMeasureLayout = {
  prepared: PreparedMeasure; staves: StaffStave[]; entries: Array<Array<{ item: StaffEvent; notes: StaffNoteAnchor[] }>>
  measureText: MeasureText; beams: StaffBeam[]; minimum: number; metrics: StaffMeasureMetrics; start: number; endInset: number; measure: StaffMeasure; spacing: number; joinedRepeat: boolean
}
export function createStaffMeasure(measure: StaffMeasure, first: boolean, hasBass: boolean, measureText: MeasureText, spacing: number, bassY = engine.bassY,
  preparation: StaffPreparation = createStaffPreparation()): StaffMeasureLayout {
  const prepared = preparation.measure(measure, first, hasBass, measureText)
  const entries = prepared.entries.map(lane => lane.map(entry => ({ item: entry.item, notes: entry.notes.map(note => ({
    prepared: note, x: 0, ys: [], headLeft: 0, headRight: 0, direction: note.direction, stemX: 0, stemEnd: 0,
  } as StaffNoteAnchor)) })))
  const flatNotes = prepared.beams.length ? entries.map(lane => lane.flatMap(entry => entry.notes)) : []
  const beams = prepared.beams.map(beam => ({ lane: beam.lane, notes: beam.indices.map(i => flatNotes[beam.lane]![i]!) }))
  for (const beam of beams) for (const note of beam.notes) note.beam = beam
  return { prepared, entries, beams, measureText, staves: [0, ...(hasBass ? [bassY] : [])].map(y => ({ x: 0, y, width: 0, noteStartX: 0 })),
    metrics: prepared.metrics, minimum: staffMinimumAtSpacing(prepared.metrics, spacing), start: prepared.metrics.start, endInset: prepared.metrics.endInset, measure, spacing, joinedRepeat: Boolean(measure.joinsPreviousRepeat && !first) }
}
export function staffLine(x1: number, y1: number, x2: number, y2: number, width = (staffMusicSize() / 4 * 0.1), cls?: string): XmlNode {
  const node = element('path', { stroke: '#000', 'stroke-width': String(width), fill: 'none', ...(cls ? { class: cls } : {}) })
  setNumericPath(node, staffLinePath(x1, y1, x2, y2))
  return node
}
function drawSignature(signature: Signature, x: number, y: number): XmlNode[] {
  return signature.symbols.map(s => {
    const glyph = staffGlyph(s.glyph, x + s.x, y + s.y, s.size)
    return s.glyph === 'gClef' || s.glyph === 'fClef' ? element('g', { class: 'staff-clef' }, [glyph]) : glyph
  })
}
/** A start repeat follows the row's clef/key/meter, then reserves its dots
 * plus one staff space before the first music ink. */
function repeatBarOffset(signatures: Signature[]): number {
  const width = Math.max(...signatures.map(signature => signature.width))
  return width + (width ? staffMusicSize() / 4 * .6 : 0)
}
export function drawStaffBar(type: string | undefined, x: number, y: number, left = false): XmlNode {
  const lines: XmlNode[] = [], bar = type ?? (left ? 'invis' : 'single')
  const rule = (dx: number, width = (staffMusicSize() / 4 * 0.1)) => {
    const line = staffLine(x + dx, y + staffMusicSize(), x + dx, y + staffMusicSize() * 2, width)
    line.attributes['data-m3n-join'] = `bar-${x + dx},${y}`
    lines.push(line)
  }
  if (bar !== 'invis') {
    if (bar === 'dbl') { rule(-(staffMusicSize() / 4 * 0.3)); rule(0) }
    else if (bar === 'end') { rule(-(staffMusicSize() / 4 * 0.5)); rule(-(staffMusicSize() / 4 * 0.1), (staffMusicSize() / 4 * 0.3)) }
    else if (bar.startsWith('rpt')) {
      if (bar === 'rptboth') { rule(0, staffMusicSize() / 4 * .3); rule(-staffMusicSize() / 4 * .6); rule(staffMusicSize() / 4 * .6) }
      else { rule((left ? 1 : -1) * (staffMusicSize() / 4 * 0.1), (staffMusicSize() / 4 * 0.3)); rule((left ? 1 : -1) * (staffMusicSize() / 4 * 0.6)) }
      for (const sign of bar === 'rptboth' ? [-1, 1] : [left ? 1 : -1]) for (const dy of [(staffMusicSize() * 1.5) - (staffMusicSize() / 8), (staffMusicSize() * 1.5) + (staffMusicSize() / 8)])
        lines.push(staffGlyph('repeatDot', x + sign * (staffMusicSize() / 4 * 1.2) - (staffMusicSize() / 4 * 0.15), y + dy))
    } else rule(0)
  }
  return element('g', { class: 'staff-bar' }, lines)
}
type FixedNoteGeometry = {
  left: number; right: number; top: number; bottom: number
  glyph: ReturnType<typeof staffGlyphMetrics>; ledgers: Array<{ y: number; xs: number[] }>
}
const fixedNoteGeometry = new WeakMap<PreparedNote, FixedNoteGeometry>()
function noteGeometry(note: PreparedNote): FixedNoteGeometry {
  let saved = fixedNoteGeometry.get(note)
  if (saved) return saved
  const rows = new Map<number, number[]>()
  if (!note.rest) for (const head of note.heads) {
    const add = (y: number) => {
      const xs = rows.get(y)
      if (xs) xs.push(head.x)
      else rows.set(y, [head.x])
    }
    for (let y = staffMusicSize() - staffMusicSize() / 4; y >= head.y; y -= staffMusicSize() / 4) add(y)
    for (let y = staffMusicSize() * 2 + staffMusicSize() / 4; y <= head.y; y += staffMusicSize() / 4) add(y)
  }
  saved = { left: Math.min(...note.heads.map(h => h.x)), right: Math.max(...note.heads.map(h => h.x)),
    top: Math.min(...note.heads.map(h => h.y)), bottom: Math.max(...note.heads.map(h => h.y)),
    glyph: staffGlyphMetrics(note.head, note.size), ledgers: [...rows].map(([y, xs]) => ({ y, xs })) }
  fixedNoteGeometry.set(note, saved)
  return saved
}
function positionNote(note: StaffNoteAnchor, x: number, y: number) {
  const p = note.prepared, fixed = noteGeometry(p)
  note.x = x; note.direction = p.direction
  note.ys = p.heads.map(h => y + h.y)
  note.headLeft = x + fixed.left
  note.headRight = x + fixed.right + fixed.glyph.right
  const mainWidth = fixed.glyph.right
  note.stemX = x + (p.direction === 1 ? mainWidth - (p.size / 4 * 0.06) : (p.size / 4 * 0.06))
  const outer = p.direction === 1 ? Math.min(...note.ys) : Math.max(...note.ys)
  note.stemEnd = outer - p.direction * Math.max(p.size * 0.875, p.size * 0.625 + Math.max(0, Math.log2(p.dur / 8)) * (p.size / 4 * 0.5))
}
function drawNote(note: StaffNoteAnchor, staveY: number, numericOnly = false): XmlNode[] {
  const p = note.prepared, size = p.size, unit = size / 4, result: XmlNode[] = [], fixed = noteGeometry(p)
  const numeric = numericOnly && !p.signature.width && !p.graces.length && !p.item.event.postfixes.includes('arp')
  const ink: Ink[] = []
  const glyph = (name: StaffGlyph, x: number, y: number, size: number, cls?: string) => {
    if (numeric) ink.push(...staffCharacterInk(staffGlyphCharacter(name), size, x, y))
    else {
      const node = staffGlyph(name, x, y, size)
      result.push(cls ? element('g', { class: cls }, [node]) : node)
    }
  }
  const line = (x1: number, y1: number, x2: number, y2: number, width: number, cls: string) => {
    if (numeric) {
      const path = staffLinePath(x1, y1, x2, y2), half = width / 2
      for (const box of path.boxes) ink.push({ left: box.left - half, right: box.right + half, top: box.top - half, bottom: box.bottom + half })
    } else {
      const node = staffLine(x1, y1, x2, y2, width, cls)
      if (note.beam) node.attributes['data-m3n-join'] = `${note.stemX},${note.stemEnd}`
      result.push(node)
    }
  }
  if (p.signature.width) result.push(element('g', { class: 'inline-signature' }, drawSignature(p.signature, note.x - p.left, staveY)))
  if (!p.rest) {
    for (const { y, xs } of fixed.ledgers) {
      let left = Infinity, right = -Infinity
      for (const x of xs) {
        left = Math.min(left, note.x + x - unit * .3)
        right = Math.max(right, note.x + x + fixed.glyph.right + unit * .3)
      }
      line(left, staveY + y, right, staveY + y, unit * .1, 'ledger-line')
    }
  }
  for (const head of p.heads) glyph(p.head, note.x + head.x, staveY + head.y + (p.rest && p.dur === 1 ? -(staffMusicSize() / 4) : 0), size, p.rest ? 'rest-symbol' : 'notehead')
  if (!p.rest && p.dur > 1) {
    const root = p.direction === 1 ? Math.max(...note.ys) - unit * .1 : Math.min(...note.ys) + unit * .1
    line(note.stemX, root, note.stemX, note.stemEnd, unit * .12, 'stem')
    if (p.dur >= 8 && !note.beam) glyph(`flag${p.dur}${p.direction === 1 ? 'Up' : 'Down'}` as StaffGlyph, note.stemX, note.stemEnd, size)
  }
  const markShift = !p.rest && p.dur > 1 && p.direction === 1
    ? Math.min(0, note.stemEnd - (staffMusicSize() / 4 * 0.6) - (staveY + Math.min(staffMusicSize(), fixed.top) - (staffMusicSize() / 4 * 1))) : 0
  let articulationTop = fixed.top + fixed.glyph.top
  let articulationBottom = fixed.bottom + fixed.glyph.bottom
  for (const s of p.symbols) {
    if (!p.rest && s.glyph.startsWith('artic')) {
      // Beam grouping can reverse a note's initial stem. Choose the side only
      // after that direction is final, always on the head side of the stem.
      const below = note.direction === 1
      const name = s.glyph.replace(/Above$/, below ? 'Below' : 'Above') as StaffGlyph
      const metrics = staffGlyphMetrics(name, s.size ?? size)
      let y = below ? articulationBottom + unit * .5 - metrics.top : articulationTop - unit * .5 - metrics.bottom
      if (name.startsWith('articStaccato')) {
        const center = y + (metrics.top + metrics.bottom) / 2
        const rule = staffMusicSize() + Math.round((center - staffMusicSize()) / unit) * unit
        const radius = (metrics.bottom - metrics.top) / 2
        // Keep the dot in an open space, including near ledger lines.
        if (Math.abs(center - rule) < radius + unit * .15)
          y += rule + (below ? unit / 2 : -unit / 2) - center
      }
      glyph(name, note.x + s.x, staveY + y, s.size ?? size)
      articulationTop = Math.min(articulationTop, y + metrics.top)
      articulationBottom = Math.max(articulationBottom, y + metrics.bottom)
    } else glyph(s.glyph, note.x + s.x, staveY + s.y +
      (s.glyph.startsWith('accidental') || s.glyph === 'augmentationDot' ? 0 : markShift), s.size ?? size)
  }
  if (numeric) {
    const snapshot = { ...note, ys: [...note.ys] }
    return [{ tagName: 'g', attributes: {}, children: [], numericInk: ink,
      renderNodes: () => drawNote(snapshot, staveY) }]
  }
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
  const graceGroups = new Map<number, Array<{ anchor: StaffNoteAnchor; slash: boolean }>>()
  for (const child of p.graces) {
    const anchor: StaffNoteAnchor = { prepared: child.note, x: 0, ys: [], headLeft: 0, headRight: 0, direction: 1, stemX: 0, stemEnd: 0 }
    positionNote(anchor, note.x - p.left + p.signature.width + (p.signature.width ? (staffMusicSize() / 4 * 0.6) : 0) + child.x, staveY)
    const group = graceGroups.get(child.group) ?? []
    group.push({ anchor, slash: child.slash })
    graceGroups.set(child.group, group)
  }
  for (const group of graceGroups.values()) {
    const beam = group.length > 1 ? { notes: group.map(child => child.anchor), lane: 0 } : undefined
    if (beam) {
      for (const note of beam.notes) note.beam = beam
      positionBeam(beam)
    }
    const children = group.map(({ anchor }) => element('g', { class: 'grace' }, drawNote(anchor, staveY)))
    if (beam) children.push(drawBeam(beam))
    if (group[0]!.slash) {
      const { anchor } = group[0]!, space = anchor.prepared.size / 4
      children.push(staffLine(anchor.stemX - space * .4, anchor.stemEnd + space * 1.5,
        anchor.stemX + space * .7, anchor.stemEnd + space * .5, space * .12, 'grace-slash'))
    }
    result.push(element('g', { class: 'grace-group' }, children))
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
    const minimum = (note.prepared.size / 4) * Math.max(2.5, (levels - 1) * .7 + .4 + 1)
    const outer = direction === 1 ? Math.min(...note.ys) : Math.max(...note.ys)
    const required = outer - direction * minimum - slope * (note.stemX - first.stemX)
    origin = direction === 1 ? Math.min(origin, required) : Math.max(origin, required)
  }
  // Fixed note ink can project into a neighboring beam segment. Solve the
  // whole group's beam envelope against those glyphs, in either direction.
  const space = first.prepared.size / 4
  const levels = Math.max(...beam.notes.map(note => Math.log2(note.prepared.dur / 4)))
  const inward = ((levels - 1) * .7 + .4) * space
  for (const note of beam.notes) for (const symbol of note.prepared.symbols) {
    if (!symbol.glyph.startsWith('accidental') && symbol.glyph !== 'augmentationDot') continue
    const ink = staffGlyphMetrics(symbol.glyph, symbol.size ?? note.prepared.size)
    const left = Math.max(first.stemX, note.x + symbol.x + ink.left)
    const right = Math.min(last.stemX, note.x + symbol.x + ink.right)
    if (right <= left) continue
    const offsets = [slope * (left - first.stemX), slope * (right - first.stemX)]
    const y = note.ys[0]! - note.prepared.heads[0]!.y + symbol.y
    const required = direction === 1
      ? y + ink.top - space * .25 - inward - Math.max(...offsets)
      : y + ink.bottom + space * .25 + inward - Math.min(...offsets)
    origin = direction === 1 ? Math.min(origin, required) : Math.max(origin, required)
  }
  for (const note of beam.notes) note.stemEnd = origin + slope * (note.stemX - first.stemX)
}
function drawBeam(beam: StaffBeam): XmlNode {
  const notes = beam.notes, direction = notes[0]!.direction, space = notes[0]!.prepared.size / 4
  const max = Math.max(...notes.map(n => Math.log2(n.prepared.dur / 4)))
  const shapes: XmlNode[] = []
  for (let level = 1; level <= max; level++) {
    let index = 0
    while (index < notes.length) {
      if (Math.log2(notes[index]!.prepared.dur / 4) < level) { index++; continue }
      const start = index++
      while (index < notes.length && Math.log2(notes[index]!.prepared.dur / 4) >= level) index++
      const a = notes[start]!, b = notes[index - 1]!
      const x1 = a.stemX, offset = direction * (level - 1) * (space * .7)
      const y1 = a.stemEnd + offset
      let x2 = b.stemX, y2 = b.stemEnd + offset
      if (a === b) {
        const neighbor = notes[start + 1] ?? notes[start - 1]!
        x2 = x1 + Math.sign(neighbor.stemX - x1) * Math.min(space, Math.abs(neighbor.stemX - x1) / 2)
        y2 = y1 + (neighbor.stemEnd - a.stemEnd) * (x2 - x1) / (neighbor.stemX - x1)
      }
      const path = element('path', { fill: '#000', stroke: 'none' })
      setNumericPath(path, staffCommandPath([{ kind: 0, values: [x1, y1] }, { kind: 1, values: [x2, y2] },
        { kind: 1, values: [x2, y2 + direction * (space * .4)] }, { kind: 1, values: [x1, y1 + direction * (space * .4)] }, { kind: 4, values: [] }]))
      shapes.push(path)
    }
  }
  return element('g', { class: 'beam', 'data-m3n-join': notes.map(note => `${note.stemX},${note.stemEnd}`).join(' ') }, shapes)
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
type NoteColumns = { column: number; endColumn: number; before: number; fraction: number }
const placementColumns = new WeakMap<PreparedMeasure, NoteColumns[][][]>()
function noteColumns(prepared: PreparedMeasure): NoteColumns[][][] {
  const cached = placementColumns.get(prepared)
  if (cached) return cached
  const duration = Math.max(0, ...prepared.entries.flatMap(lane => lane.map(entry => entry.item.onset + entry.item.beats)))
  const columns = prepared.entries.map(lane => lane.map(entry => entry.notes.map((_, i) => {
    const onset = entry.item.children ? entry.item.onset + i * entry.item.beats / entry.notes.length : entry.item.onset
    const column = prepared.onsets.findIndex(value => Math.abs(value - onset) < 1e-7)
    const beat = onset + entry.item.beats / entry.notes.length
    const endColumn = prepared.onsets.findIndex(onset => onset >= beat - 1e-7)
    const before = endColumn < 0 ? prepared.onsets.length - 1 : endColumn - 1
    const endBeat = endColumn < 0 ? duration : prepared.onsets[endColumn]!
    const fraction = endColumn === 0 ? 0 : Math.min(1, Math.max(0, (beat - prepared.onsets[before]!) / (endBeat - prepared.onsets[before]! || 1)))
    return { column, endColumn, before, fraction }
  })))
  placementColumns.set(prepared, columns)
  return columns
}
function staffRules(x: number, y: number, width: number): XmlNode {
  const size = staffMusicSize(), space = size / 4, half = space * .1 / 2
  const ink: Ink[] = []
  for (let i = 0; i < 5; i++) {
    const path = staffLinePath(x, y + size + space * i, x + width, y + size + space * i)
    for (const box of path.boxes) ink.push({ left: box.left - half, right: box.right + half, top: box.top - half, bottom: box.bottom + half })
  }
  return { tagName: 'g', attributes: { class: 'staff-line' }, children: [], numericInk: ink,
    renderNodes: () => Array.from({ length: 5 }, (_, i) => staffLine(x, y + size + space * i, x + width, y + size + space * i, space * .1, 'staff-line')) }
}
export function drawStaffMeasure(model: StaffMeasureLayout, width: number, x: number, suppressEndRepeat = false, numericOnly = false): XmlNode {
  const { prepared } = model
  const extra = Math.max(0, width - model.minimum)
  const localPositions = staffSpacingPositions(prepared, model.spacing, extra)
  const positions = localPositions.map(position => x + model.start + position)
  const columns = noteColumns(prepared)
  for (const [lane, stave] of model.staves.entries()) {
    stave.x = x; stave.width = width; stave.noteStartX = x + model.start
    for (const [entryIndex, entry] of model.entries[lane]!.entries()) for (const [i, note] of entry.notes.entries()) {
      const { column, endColumn, before, fraction } = columns[lane]![entryIndex]![i]!
      positionNote(note, positions[column]!, stave.y)
      const end = endColumn < 0 ? x + width - model.endInset : positions[endColumn]!
      const time = endColumn === 0 ? positions[0]! : positions[before]! + (end - positions[before]!) * fraction
      note.durationEndX = Math.max(note.headRight, time - staffMusicSize() / 8)
    }
  }
  model.beams.forEach(positionBeam)
  const measureNode = element('g', { id: model.measure.id, class: 'measure' })
  // Audit-only attributes are materialized together with the SVG element.
  // Candidate geometry only needs the captured local positions and children.
  measureNode.renderNodes = () => {
    if (measureNode.attributes['data-m3n-reading-ratio'] === undefined) {
      const reading = scoreReadingWindows(localPositions.map((x, index) => ({
        beat: prepared.onsets[index]!, x, preferredNext: prepared.metrics.columns[index]!.naturalAdvance,
      })))
      measureNode.attributes['data-m3n-reading-ratio'] = String(reading.worstRatio)
      measureNode.attributes['data-m3n-reading-penalty'] = String(reading.penalty)
    }
    return [element('g', measureNode.attributes, measureNode.children)]
  }
  for (const [lane, stave] of model.staves.entries()) {
    const staff = element('g', { class: 'staff', 'data-staff': lane ? 'bass' : 'melody' })
    if (numericOnly) staff.children.push(staffRules(x, stave.y, width))
    else for (let i = 0; i < 5; i++) staff.children.push(staffLine(x, stave.y + staffMusicSize() + (staffMusicSize() / 4) * i, x + width, stave.y + staffMusicSize() + (staffMusicSize() / 4) * i, (staffMusicSize() / 4 * 0.1), 'staff-line'))
    const leftBarX = x + (!model.joinedRepeat && model.measure.source.left?.startsWith('rpt') ? repeatBarOffset(prepared.signatures) : 0)
    staff.children.push(drawStaffBar(model.joinedRepeat ? 'rptboth' : model.measure.source.left, leftBarX, stave.y, true), drawStaffBar(suppressEndRepeat ? 'invis' : model.measure.source.right, x + width, stave.y),
      element('g', { class: 'staff-signature', id: `${model.measure.id}-signature-${lane}` }, drawSignature(prepared.signatures[lane]!, x, stave.y)))
    for (const entry of model.entries[lane]!) {
      const attrs: Record<string, string> = { id: entry.item.id, class: entry.item.event.kind }
      if (/-rend\d+$/.test(entry.item.id)) {
        attrs['data-m3n-id'] = entry.item.id.replace(/-rend\d+$/, '')
        attrs['data-m3n-passes'] = /-rend(\d+)$/.exec(entry.item.id)![1]!
      }
      const event = element('g', attrs)
      let preparedInk: Ink[] | undefined = numericOnly ? [] : undefined
      for (const [i, note] of entry.notes.entries()) {
        const music = drawNote(note, stave.y, numericOnly)
        if (preparedInk) {
          if (music.every(child => child.numericInk)) for (const child of music) preparedInk.push(...child.numericInk!)
          else preparedInk = undefined
        }
        if (entry.item.children) event.children.push(element('g', { id: entry.item.children[i]!.id, class: entry.item.children[i]!.event.kind }, music))
        else event.children.push(...music)
      }
      if (preparedInk) event.preparedMusicInk = { boxes: preparedInk,
        classes: [entry.item.event.kind, ...(entry.item.children ?? []).map(child => child.event.kind)] }
      staff.children.push(event)
      if (entry.item.children && entry.item.event.tuplet) staff.children.push(drawTuplet(entry.notes, entry.item, stave.y, model.measureText))
    }
    for (const beam of model.beams.filter(beam => beam.lane === lane)) staff.children.push(drawBeam(beam))
    measureNode.children.push(staff)
  }
  return measureNode
}
/** Ports sit just outside the head vertically. Single heads may use their
 * upper/lower shoulder; only symbols crossing that height extend the port.
 * This descriptor is shared by spacing reservations and final drawing. */
function staffTiePorts(note: PreparedNote, index: number, direction = -note.direction) {
  const head = note.heads[index]!, glyph = staffGlyphMetrics(note.head, note.size), space = staffMusicSize() / 4
  const inset = note.heads.length === 1 ? (glyph.right - glyph.left) * .2 : -space * .1
  const y = head.y + (direction < 0 ? glyph.top - space * .2 : glyph.bottom + space * .2)
  let start = head.x + glyph.right - inset, end = head.x + glyph.left + inset
  // A shoulder on the stem side is not free even when the head itself clears
  // the port vertically. Keep that endpoint outside the stem's x footprint.
  if (note.dur > 1 && direction === -note.direction) {
    if (note.direction === 1) start = Math.max(start, head.x + glyph.right + space * .1)
    else end = Math.min(end, head.x + glyph.left - space * .1)
  }
  for (const symbol of note.symbols) {
    const ink = staffGlyphMetrics(symbol.glyph, symbol.size ?? note.size)
    if (symbol.y + ink.bottom < y - space * .12 || symbol.y + ink.top > y + space * .12) continue
    start = Math.max(start, symbol.x + ink.right + space * .1)
    end = Math.min(end, symbol.x + ink.left - space * .1)
  }
  if (note.graces.length || note.signature.width)
    end = Math.min(end, -note.left + note.signature.width + note.graceWidth - space * .1)
  return { start, end, y }
}

/** Open ties use system boundaries; one ribbon is drawn for each chord member. */
export function drawStaffTie(first: StaffNoteAnchor | undefined, last: StaffNoteAnchor | undefined, left: number, right: number, obstacles: readonly Ink[] = []): XmlNode[] {
  const note = first ?? last!
  const direction = -note.direction, count = Math.min(first?.ys.length ?? Infinity, last?.ys.length ?? Infinity)
  const curves: XmlNode[] = []
  for (let i = 0; i < count; i++) {
    const x1 = first ? first.x + staffTiePorts(first.prepared, i, direction).start : left
    const x2 = last ? last.x + staffTiePorts(last.prepared, i, direction).end : right
    const portY = (anchor: StaffNoteAnchor) => anchor.ys[i]! + staffTiePorts(anchor.prepared, i, direction).y - anchor.prepared.heads[i]!.y
    const y1 = portY(first ?? last!), y2 = portY(last ?? first!)
    const space = staffMusicSize() / 4, thickness = space * .23
    let rise = Math.min(space * 1.6, Math.max(space * .6, (x2 - x1) / 6))
    // Keep the note attachments fixed while bending around a crossed
    // key/meter signature. Cubic x is linear in t for these control points.
    for (const obstacle of obstacles) {
      if (obstacle.right <= x1 || obstacle.left >= x2 || x2 <= x1) continue
      const a = Math.max(0, (obstacle.left - x1) / (x2 - x1))
      const b = Math.min(1, (obstacle.right - x1) / (x2 - x1))
      const factor = 3 * Math.min(a * (1 - a), b * (1 - b))
      if (factor <= 0) continue
      const ya = y1 + (y2 - y1) * a * a * (3 - 2 * a), yb = y1 + (y2 - y1) * b * b * (3 - 2 * b)
      const needed = direction < 0 ? Math.max(ya, yb) - obstacle.top + space * .4
        : obstacle.bottom + space * .4 - Math.min(ya, yb)
      rise = Math.max(rise, needed / factor + thickness)
    }
    // Keep the bow's apex clear of staff rules. A short tie with the old
    // .6-space control rise peaks almost exactly on the next staff line.
    const staffTop = note.ys[i]! - note.prepared.heads[i]!.y + staffMusicSize()
    const middle = (y1 + y2) / 2, apex = middle + direction * rise * .75
    const rule = Math.round((apex - staffTop) / space), ruleY = staffTop + rule * space
    if (rule >= 0 && rule <= 4 && Math.abs(apex - ruleY) < space * .25)
      rise = Math.max(rise, (ruleY + direction * space * .25 - middle) / (direction * .75))
    const height = direction * rise, dx = (x2 - x1) / 3
    const path = element('path', { fill: '#000', stroke: 'none' })
    setNumericPath(path, staffCommandPath([{ kind: 0, values: [x1, y1] },
      { kind: 3, values: [x1 + dx, y1 + height, x2 - dx, y2 + height, x2, y2] },
      { kind: 3, values: [x2 - dx, y2 + height - direction * (staffMusicSize() / 4 * 0.23), x1 + dx, y1 + height - direction * (staffMusicSize() / 4 * 0.23), x1, y1] }, { kind: 4, values: [] }]))
    curves.push(path)
  }
  return curves
}
