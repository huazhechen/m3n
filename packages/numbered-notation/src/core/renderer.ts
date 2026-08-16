import { pageSpacing, type NumberedNotationLayout } from './config.js'
import {
  ACCIDENTAL_GLYPH_IDS,
  BARLINE_GLYPH_IDS,
  barlineOrnamentGlyph,
  escapeXml,
  formatNumber,
  graceAccidentalGlyph,
  GlyphRegistry,
  ornamentGlyph,
} from './glyphs.js'
import { graceMetrics } from './grace.js'
import { layoutVoiceGroup, type LineLayout, type PositionedElement } from './layout.js'
import { playbackTime } from './timing.js'
import { scoreHeaderLayout, type ScoreHeaderMetadata } from '@m3n/notation'
import type {
  BarlineElement,
  InlineLayerElement,
  Mark,
  Metadata,
  NoteElement,
  Ornament,
  ScoreLine,
  ScoreDocument,
  ScorePage,
  SustainElement,
} from './types.js'

const FONT_SIZE_FIX = 0.8355
const INK = '#1b1b1b'
const NUMBERED_PLAYBACK_HIGHLIGHT_FILTER = '<filter id="m3n-playback-highlight" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="table" tableValues="0.851 1"/><feFuncG type="table" tableValues="0.373 1"/><feFuncB type="table" tableValues="0.165 1"/></feComponentTransfer></filter>'
// The compact numeral is 14.4 units high. A 22-unit pitch keeps adjacent
// chord members and their octave dots distinct.
const CHORD_STACK_STEP = 22
const OCTAVE_DOT_DIAMETER = 3.04
const OCTAVE_DOT_CLEARANCE = 1
const OCTAVE_DOT_STEP = OCTAVE_DOT_DIAMETER + OCTAVE_DOT_CLEARANCE
const GRACE_UNDERLINE_Y = -3.7
const GRACE_UNDERLINE_STEP = 1.9
const GRACE_UNDERLINE_OVERHANG = 3
const GRACE_UNDERLINE_STROKE = 0.9
const DYNAMIC_ORNAMENTS = new Set([
  'ppp',
  'pp',
  'p',
  'mp',
  'mf',
  'f',
  'ff',
  'fff',
  'cresc',
  'dim',
  'sf',
  'fp',
  'sfp',
  'atempo',
  'rit',
])
const DYNAMIC_GLYPH_SIZE = 22
const TRILL_LABEL_SIZE = 13
const TEXT_DIRECTIVE_SIZE = 14
const SECTION_LABEL_SIZE = 14

function text(
  value: string,
  x: number,
  y: number,
  options: {
    font: string
    size: number
    anchor?: 'start' | 'middle' | 'end'
    bold?: boolean
    italic?: boolean
    fill?: string
    dy?: number
    extra?: Readonly<Record<string, string | number>>
  },
): string {
  const style = [
    options.bold === true ? 'font-weight:bold' : '',
    options.italic === true ? 'font-style:italic' : '',
  ]
    .filter(Boolean)
    .join(';')
  const extra =
    options.extra === undefined
      ? ''
      : Object.entries(options.extra)
          .map(([name, item]) => ` ${name}="${escapeXml(String(item))}"`)
          .join('')
  return `<text x="${formatNumber(x)}" y="${formatNumber(y)}" dy="${formatNumber(options.dy ?? FONT_SIZE_FIX * options.size)}"${options.anchor === undefined || options.anchor === 'start' ? '' : ` text-anchor="${options.anchor}"`} fill="${options.fill ?? INK}"${style === '' ? '' : ` style="${style};"`} font-size="${formatNumber(options.size)}" font-family="${escapeXml(options.font)}"${extra}>${escapeXml(value)}</text>`
}

function isAscii(value: string) {
  return [...value].every((character) => (character.codePointAt(0) ?? 0x80) <= 0x7f)
}

function numberedGlyph(
  registry: GlyphRegistry,
  id: string,
  x: number,
  y: number,
  extra: Readonly<Record<string, string | number | undefined>> = {},
): string {
  const compactId = /^shuzi_b_([0-7])$/.exec(id)?.[1]
  return registry.use(compactId === undefined ? id : `shuzi_b_bian_${compactId}`, x, y, extra)
}

function staffTempoGlyph(x: number, y: number): string {
  return `<text x="${formatNumber(x)}" y="${formatNumber(y)}" fill="${INK}" font-family="Leipzig" font-size="30.24">&#xECA5;</text>`
}

function keyChangeLabel(key: string, x: number, y: number): string[] {
  const letter = key.match(/[A-G]/)?.[0] ?? 'C'
  const accidental = key.match(/[#$b]/)?.[0]
  const output = [text('1', x, y, { font: 'system-ui, sans-serif', size: 14, dy: 0 })]
  output.push(text('=', x + 10.5, y, { font: 'system-ui, sans-serif', size: 13, dy: 0 }))
  output.push(text(letter, x + (accidental === undefined ? 22 : 27), y, { font: 'system-ui, sans-serif', size: 14, dy: 0 }))
  if (accidental !== undefined) output.push(text(accidental, x + 20, y - 4, { font: 'system-ui, sans-serif', size: 9, dy: 0 }))
  return output
}

const LEIPZIG_ORNAMENTS: Readonly<Partial<Record<Ornament['name'], string>>> = {
  ppp: '&#xE520;&#xE520;&#xE520;',
  pp: '&#xE520;&#xE520;',
  p: '&#xE520;',
  mp: '&#xE521;&#xE520;',
  mf: '&#xE521;&#xE522;',
  f: '&#xE522;',
  ff: '&#xE522;&#xE522;',
  fff: '&#xE522;&#xE522;&#xE522;',
  sf: '&#xE524;&#xE522;',
  tr: '&#xE566;',
}

const LEIPZIG_NAVIGATION_GLYPHS: Readonly<Partial<Record<string, string>>> = {
  segno: '&#xE047;',
  ds: '&#xE045;',
  dc: '&#xE046;',
}

function leipzigGlyph(glyph: string, x: number, y: number, size: number): string {
  return `<text x="${formatNumber(x)}" y="${formatNumber(y)}" fill="${INK}" font-family="Leipzig" font-size="${formatNumber(size)}">${glyph}</text>`
}

function musicGlyph(registry: GlyphRegistry, id: string, x: number, y: number): string {
  return registry.use(id, x, y)
}

function octaveDot(x: number, y: number, upper: boolean): string {
  return `<circle cx="${formatNumber(x)}" cy="${formatNumber(y + (upper ? -11.2 : 10.4))}" r="1.52" fill="${INK}"></circle>`
}

function lowerOctaveDotY(y: number, underlineCount: number, octave: number): number {
  if (underlineCount === 0) return y + 0.48 + octave * OCTAVE_DOT_STEP
  // Keep one unit of empty space between the last underline and the first dot.
  return y + 2.92 + (underlineCount - 1) * 3.2 + octave * OCTAVE_DOT_STEP
}

function augmentationDot(x: number, y: number, m3nDataId?: string): string {
  const dataId = m3nDataId === undefined ? '' : ` data-m3n-id="${escapeXml(m3nDataId)}"`
  return `<circle cx="${formatNumber(x + 9.88)}" cy="${formatNumber(y - 0.2)}" r="1.96" fill="${INK}"${dataId}></circle>`
}

function audioCode(note: NoteElement): string {
  const octave = note.octave > 0 ? "'".repeat(note.octave) : ','.repeat(Math.abs(note.octave))
  return `${note.pitch}${octave}`
}

function modeHeader(
  metadata: Metadata,
  config: NumberedNotationLayout,
  y: number,
): string[] {
  const output: string[] = []
  const spacingScale = 0.6
  const keySpacing = 0.8
  const headerFont = 'system-ui, sans-serif'
  let x = config.marginLeft
  if (metadata.mode !== undefined) {
    const letter = metadata.mode.match(/[A-G]/)?.[0]
    const accidental = metadata.mode.match(/[#$]/)?.[0]
    const letterX = x + (accidental === undefined ? 28 : 34)
    output.push(text('1', x, y + 5.6, { font: headerFont, size: 16, dy: 0 }))
    output.push(text('=', x + 13.2, y + 5.6, { font: headerFont, size: 15, dy: 0 }))
    output.push(text(letter ?? 'C', letterX, y + 5.6, { font: headerFont, size: 16, dy: 0 }))
    if (accidental !== undefined) {
      output.push(
        text(accidental, letterX - 7, y + 1.4, { font: headerFont, size: 10, dy: 0 }),
      )
    }
    x += (accidental === undefined ? 64 : 72) * keySpacing
  }

  metadata.meters.forEach((meter, index) => {
    const previousParenthesized = metadata.meters[index - 1]?.parenthesized === true
    const nextParenthesized = metadata.meters[index + 1]?.parenthesized === true
    if (meter.parenthesized && !previousParenthesized) {
      output.push(text('(', x, y + 5.6, { font: headerFont, size: 16, dy: 0 }))
      x += 15 * spacingScale
    }
    // Keep the numerator and denominator optically balanced around the divider.
    // Their baselines must not sit on the rule: UI-font descenders otherwise make
    // a compact meter look like the bar runs through its digits.
    output.push(`<rect x="${formatNumber(x + 0.8)}" y="${formatNumber(y - 0.7)}" width="16.8" height="1.4" fill="${INK}"></rect>`)
    const digitX = x + 9.2
    output.push(text(String(meter.numerator), digitX, y - 7, {
      font: headerFont, size: 16, anchor: 'middle', dy: 0,
    }))
    output.push(text(String(meter.denominator), digitX, y + 17, {
      font: headerFont, size: 16, anchor: 'middle', dy: 0,
    }))
    x += 32 * spacingScale
    if (meter.parenthesized && !nextParenthesized) {
      output.push(text(')', x, y + 5.6, { font: headerFont, size: 16, dy: 0 }))
      x += 15 * spacingScale
    }
  })

  metadata.tempos.forEach((tempo) => {
    const tempoX = x + (x === config.marginLeft ? 0 : 12)
    const tempoY = y + 6
    if (typeof tempo === 'number') {
      if (config.musicFontCss === undefined) {
        output.push(staffTempoGlyph(tempoX, tempoY))
      } else {
        output.push(staffTempoGlyph(tempoX, tempoY))
      }
      const equalsX = tempoX + 22
      output.push(text('=', equalsX - 5, y + 5.6, { font: headerFont, size: 15, dy: 0 }))
      output.push(
        text(String(tempo), equalsX + 10, tempoY, {
          font: headerFont,
          size: 16,
          dy: 0,
          extra: { 'data-jiepai': tempo },
        }),
      )
      x = equalsX + 20 + String(tempo).length * 10
    } else {
      output.push(
        text(tempo, tempoX, tempoY, {
          font: headerFont,
          size: config.tempoSize,
          dy: 0,
        }),
      )
      x = tempoX + Math.max(24, tempo.length * config.tempoSize)
    }
  })
  return output
}

function renderHeader(
  metadata: Metadata,
  config: NumberedNotationLayout,
): { markup: string[]; bodyY: number } {
  const headerMetadata: ScoreHeaderMetadata[] = [
    ...metadata.titles.map((value, priority) => ({ value, side: 'center' as const, priority: priority * 10 })),
    ...metadata.authors.map((value, index) => ({ value, side: 'right' as const, priority: 20 + index })),
  ]
  if (headerMetadata.length === 0) {
    return { markup: [], bodyY: config.bodyMarginTop + 6 }
  }
  const header = scoreHeaderLayout(headerMetadata, config.width)
  const markup = header.lines.map((line) => (
    text(line.value, line.x, line.y, {
      font: line.font,
      size: line.size,
      anchor: line.anchor,
      bold: line.bold,
      fill: line.fill,
      dy: 0,
    })
  ))
  const infoY = header.height - 11
  markup.push(...modeHeader(metadata, config, infoY))
  return {
    markup,
    bodyY: header.height + 32,
  }
}

function notePositionCode(page: number, line: number, item: number): string {
  return `${page}_${line}_${item}`
}

function itemOrdinals(line: ScoreLine): Map<number, number> {
  const ordinals = new Map<number, number>()
  let ordinal = 0
  line.elements.forEach((element, index) => {
    if (element.kind === 'note' || element.kind === 'sustain' || element.kind === 'barline') {
      ordinal += 1
      ordinals.set(index, ordinal)
    }
  })
  return ordinals
}

function renderGrace(
  notes: NoteElement[],
  x: number,
  y: number,
  before: boolean,
  id: string,
  registry: GlyphRegistry,
): string[] {
  if (notes.length === 0) return []
  const metrics = graceMetrics(notes)
  const noteLevels = notes.map((note) =>
    Math.min(3, Math.max(1, Math.ceil(Math.log2(note.duration / 4)))),
  )
  const maxLevels = Math.max(...noteLevels)
  const body: string[] = []

  for (let level = 0; level < maxLevels; level += 1) {
    let runStart: number | undefined
    notes.forEach((_, index) => {
      const participates = (noteLevels[index] ?? 0) > level
      if (participates && runStart === undefined) runStart = index
      const runEnds = runStart !== undefined && (!participates || index === notes.length - 1)
      if (!runEnds || runStart === undefined) return
      const runEnd = participates ? index : index - 1
      const x1 = (metrics.positions[runStart] ?? 0) - GRACE_UNDERLINE_OVERHANG
      const x2 = (metrics.positions[runEnd] ?? 0) + GRACE_UNDERLINE_OVERHANG
      const lineY = GRACE_UNDERLINE_Y + level * GRACE_UNDERLINE_STEP
      body.push(
        `<line x1="${formatNumber(x1)}" y1="${formatNumber(lineY)}" x2="${formatNumber(x2)}" y2="${formatNumber(lineY)}" stroke-width="${GRACE_UNDERLINE_STROKE}" stroke="${INK}"></line>`,
      )
      runStart = undefined
    })
  }

  notes.forEach((note, index) => {
    const localX = metrics.positions[index] ?? 0
    const glyph = note.pitch === 9 ? 'shuzi_x' : `yiyin_shuzi_${note.pitch}`
    body.push(registry.use(glyph, localX, -10.2))
    if (note.accidental !== undefined) {
      body.push(registry.use(graceAccidentalGlyph(note.accidental), localX, -11.4))
    }
    const octaveGlyph = note.octave >= 0 ? 'yiyin_yingao_gao' : 'yiyin_yingao_di'
    for (let octave = 0; octave < Math.abs(note.octave); octave += 1) {
      body.push(
        registry.use(
          octaveGlyph,
          localX,
          note.octave > 0
            ? -10.8 - octave * 2.4
            : -7.2 + ((noteLevels[index] ?? 1) - 1) * GRACE_UNDERLINE_STEP + octave * 2.4,
        ),
      )
    }
  })
  const tail = before ? 'yiyinxian_qian' : 'yiyinxian_hou'
  const firstX = metrics.positions[0] ?? 0
  const lastX = metrics.positions.at(-1) ?? firstX
  const tailX = (firstX + lastX) / 2 - 0.3
  const lowerOctaves = Math.max(0, ...notes.map((note) => -note.octave))
  const tailY = -10.2 + (maxLevels - 1) * GRACE_UNDERLINE_STEP + lowerOctaves * 2.4
  body.push(registry.use(tail, tailX, tailY))
  registry.define(id, body.join(''))
  return [registry.useDefined(id, before ? x - metrics.width - 3 : x + 9, y)]
}

interface OrnamentContext {
  hairpinStart?: boolean
  hairpinEnd?: boolean
  slurEnd?: boolean
  upperClearance?: number
}

function ornamentPosition(
  ornament: Ornament,
  x: number,
  y: number,
  context: OrnamentContext,
): { x: number; y: number } {
  if (DYNAMIC_ORNAMENTS.has(ornament.name)) {
    // Dynamics need their own upper lane. Keeping them near the numeral
    // baseline makes p/mf/f collide with octave dots, grace notes and labels.
    const upperClearance = context.upperClearance ?? 0
    if (context.hairpinStart === true) return { x: x - 15, y: y - 38 - upperClearance - ornament.level * 3.6 }
    if (context.hairpinEnd === true) {
      return {
        x: x + 12,
        y: y - 38 - upperClearance - ornament.level * 3.6 - (context.slurEnd === true ? 4.8 : 0),
      }
    }
    return { x, y: y - 38 - upperClearance - ornament.level * 3.6 }
  }
  if (ornament.name === 'tr') return { x, y: y - 21 - (context.upperClearance ?? 0) }
  if (['zkh', 'ykh', 'cy', 'tr', 'yc', 'ycy', 'shy', 'xhy'].includes(ornament.name)) {
    return { x, y }
  }
  if (ornament.name === 'bc') return { x, y: y - 10.2 - ornament.level * 3.6 }
  return { x, y: y - 14.4 - ornament.level * 3.6 }
}

function renderOrnaments(
  ornaments: Ornament[],
  x: number,
  y: number,
  registry: GlyphRegistry,
  config: NumberedNotationLayout,
  context: OrnamentContext = {},
): string[] {
  return ornaments.flatMap((ornament) => {
    const position = ornamentPosition(ornament, x, y, context)
    if (ornament.name === 'tr') {
      return [text('tr', position.x, position.y, {
        font: 'ui-serif, serif',
        size: TRILL_LABEL_SIZE,
        italic: true,
        dy: 0,
      })]
    }
    const glyph = config.musicFontCss === undefined ? undefined : LEIPZIG_ORNAMENTS[ornament.name]
    if (glyph !== undefined) {
      return [leipzigGlyph(glyph, position.x, position.y, DYNAMIC_GLYPH_SIZE)]
    }
    const id = ornamentGlyph(ornament)
    if (id === undefined) return []
    return [registry.use(id, position.x, position.y)]
  })
}

function renderInlineOrnaments(
  ornaments: Ornament[],
  x: number,
  y: number,
  registry: GlyphRegistry,
  config: NumberedNotationLayout,
): string[] {
  return ornaments.flatMap((ornament) => {
    const glyph = config.musicFontCss === undefined ? undefined : LEIPZIG_ORNAMENTS[ornament.name]
    const position = ornamentPosition(ornament, x, y, {})
    if (ornament.name === 'tr') return text('tr', position.x, position.y, {
      font: 'ui-serif, serif', size: TRILL_LABEL_SIZE, italic: true, dy: 0,
    })
    if (glyph !== undefined) return leipzigGlyph(glyph, position.x, position.y, DYNAMIC_GLYPH_SIZE)
    const id =
      ornament.name === 'zkh'
        ? 'kuohu_zuo_bian'
        : ornament.name === 'ykh'
          ? 'kuohu_you_bian'
          : ornamentGlyph(ornament)
    if (id === undefined) return []
    return registry.use(id, position.x, position.y)
  })
}

function renderChordPitch(
  note: NoteElement,
  chordPitch: NonNullable<NoteElement['chordPitches']>[number],
  x: number,
  y: number,
  config: NumberedNotationLayout,
  registry: GlyphRegistry,
): string[] {
  const output: string[] = []
  output.push(numberedGlyph(registry, `shuzi_${config.numberStyle}_${chordPitch.pitch}`, x, y, {
    code: String(chordPitch.pitch),
    'data-m3n-id': note.m3nDataId ?? note.m3nId,
  }))
  if (chordPitch.accidental !== undefined) output.push(musicGlyph(registry, ACCIDENTAL_GLYPH_IDS[chordPitch.accidental], x, y))
  const underlineCount = Math.max(0, Math.log2(note.duration / 4))
  for (let octave = 0; octave < Math.abs(chordPitch.octave); octave += 1) {
      const octaveY = chordPitch.octave > 0
        ? y - octave * OCTAVE_DOT_STEP
        : lowerOctaveDotY(y, underlineCount, octave)
      output.push(octaveDot(x, octaveY, chordPitch.octave >= 0))
  }
  return output
}

function chordCenterOffset(note: NoteElement): number {
  return (note.chordPitches?.length ?? 0) * CHORD_STACK_STEP / 2
}

function upperOctaveClearance(octave: number): number {
  return octave > 0 ? 5.52 + (octave - 1) * OCTAVE_DOT_STEP : 0
}

function chordTopClearance(note: NoteElement): number {
  const members = [
    { octave: note.octave, offset: chordCenterOffset(note) },
    ...(note.chordPitches ?? []).map((pitch, index) => ({
      octave: pitch.octave,
      offset: chordCenterOffset(note) - (index + 1) * CHORD_STACK_STEP,
    })),
  ]
  return Math.max(0, ...members.map(({ octave, offset }) => upperOctaveClearance(octave) - offset))
}

function renderNote(
  note: NoteElement,
  x: number,
  y: number,
  notepos: string,
  config: NumberedNotationLayout,
  registry: GlyphRegistry,
  timeOverride?: number,
  audioOverride?: string,
  ornamentContext: OrnamentContext = {},
  nextGraceId: (prefix: 'qy' | 'hy') => string = (prefix) =>
    `${prefix}${notepos.replaceAll('_', '-')}`,
): string[] {
  const output: string[] = []
  if (note.hidden) {
    return [
      registry.use('shuzi_null', x, y, {
        time: 0,
        audio: '',
        notepos,
        code: note.code,
      }),
    ]
  }
  if (!note.hidden) {
    const noteY = y + chordCenterOffset(note)
    const id = note.pitch === 9 ? 'shuzi_x' : `shuzi_${config.numberStyle}_${note.pitch}`
    output.push(
      numberedGlyph(registry, id, x, noteY, {
        time: formatNumber(timeOverride ?? playbackTime(note)),
        audio: audioOverride ?? audioCode(note),
        notepos,
        code: note.code,
        id: note.m3nId,
        'data-m3n-id': note.m3nDataId ?? note.m3nId,
      }),
    )
    if (note.accidental !== undefined) {
      output.push(musicGlyph(registry, ACCIDENTAL_GLYPH_IDS[note.accidental], x, noteY))
    }
    const underlineCount = Math.max(0, Math.log2(note.duration / 4))
    for (let octave = 0; octave < Math.abs(note.octave); octave += 1) {
      const octaveY = note.octave > 0
        ? noteY - octave * OCTAVE_DOT_STEP
        : lowerOctaveDotY(noteY, underlineCount, octave)
      output.push(octaveDot(x, octaveY, note.octave >= 0))
    }
    if (note.dots >= 1) output.push(augmentationDot(x, noteY, note.m3nDataId ?? note.m3nId))
    if (note.dots >= 2) output.push(augmentationDot(x + 5.6, noteY, note.m3nDataId ?? note.m3nId))
    for (let dot = 2; dot < note.dots; dot += 1)
      output.push(augmentationDot(x + 6.72 + (dot - 2) * 3.36, noteY, note.m3nDataId ?? note.m3nId))
    note.chordPitches?.forEach((chordPitch, index) => {
      output.push(...renderChordPitch(note, chordPitch, x, noteY - (index + 1) * CHORD_STACK_STEP, config, registry))
    })
    if (note.graceBefore !== undefined) {
      output.push(...renderGrace(note.graceBefore, x, noteY, true, nextGraceId('qy'), registry))
    }
    if (note.graceAfter !== undefined) {
      output.push(...renderGrace(note.graceAfter, x, noteY, false, nextGraceId('hy'), registry))
    }
    const labelClearance = chordTopClearance(note)
    const annotationY = noteY - 24 - labelClearance
    if (note.sectionLabel !== undefined) {
      output.push(
        text(note.sectionLabel, x - 10, annotationY - 20, {
          font: 'serif',
          size: SECTION_LABEL_SIZE,
          bold: true,
          fill: '#1b1b1b',
          dy: 0,
        }),
      )
    }
    if (note.annotation !== undefined) {
      output.push(
        text(note.annotation, x - 4.8, annotationY, {
          font: 'serif',
          size: TEXT_DIRECTIVE_SIZE,
          fill: '#303030',
          italic: true,
          dy: 0,
          extra: { 'xml:space': 'preserve' },
        }),
      )
    }
    if (note.keyChange !== undefined) {
      output.push(...keyChangeLabel(note.keyChange, x - 14, noteY - 19))
    }
    output.push(...renderOrnaments(note.ornaments, x, noteY, registry, config, {
      ...ornamentContext,
      upperClearance: chordTopClearance(note),
    }))
  }
  return output
}

function renderSustain(
  sustain: SustainElement,
  x: number,
  y: number,
  notepos: string,
  registry: GlyphRegistry,
  config: NumberedNotationLayout,
  timeOverride?: number,
): string[] {
  return [
    registry.use('yanyinfu', x, y, {
      time: formatNumber(timeOverride ?? 1),
      audio: '',
      notepos,
      code: sustain.code,
      'data-m3n-id': sustain.m3nDataId,
    }),
    ...renderOrnaments(sustain.ornaments, x, y, registry, config),
  ]
}

function renderBarline(
  barline: BarlineElement | undefined,
  synthetic: boolean,
  x: number,
  y: number,
  notepos: string,
  registry: GlyphRegistry,
  config: NumberedNotationLayout,
): string[] {
  const normalizedCodes = {
    normal: '|',
    end: '|j',
    double: '|s',
    'repeat-start': '|z',
    'repeat-end': '|y',
    'repeat-both': '|l',
    hidden: '|n',
    invisible: '|w',
  } as const
  const sourceCodes = {
    normal: '|',
    end: '||',
    double: '||/',
    'repeat-start': '|:',
    'repeat-end': ':|',
    'repeat-both': ':|:',
    hidden: '|/',
    invisible: '|*',
  } as const
  const type = barline?.type ?? 'normal'
  let suffix = barline === undefined ? '' : barline.code.slice(sourceCodes[type].length)
  if (type === 'repeat-end' && suffix.startsWith('|')) suffix = `j${suffix.slice(1)}`
  const code = synthetic ? '|w' : `${normalizedCodes[type]}${suffix}`
  if (type === 'hidden') {
    return [
      `<use x="${formatNumber(x)}" y="${formatNumber(y)}" xlink:href="#xiaojiexian_none" notepos="${escapeXml(notepos)}" time="0" audio="" code="${escapeXml(code)}" xmlns:xlink="http://www.w3.org/1999/xlink"></use>`,
    ]
  }
  if (type === 'invisible') {
    return [
      registry.use('xiaojiexian_weibu', x, y, {
        notepos,
        time: 0,
        audio: '',
        code,
      }),
    ]
  }
  const id = synthetic ? 'xiaojiexian_weibu' : BARLINE_GLYPH_IDS[type]
  const output = [
    registry.use(id, x, y, {
      notepos,
      time: 0,
      audio: '',
      code,
    }),
  ]
  barline?.ornaments.forEach((ornament) => {
    const leipzigGlyphCode = config.musicFontCss === undefined
      ? undefined
      : LEIPZIG_NAVIGATION_GLYPHS[ornament.name]
    if (leipzigGlyphCode !== undefined) {
      // Verovio anchors navigation signs above the last musical event, not
      // on the trailing barline. Preserve that placement in numbered scores.
      output.push(leipzigGlyph(leipzigGlyphCode, x - 46, y - 30, 24))
      return
    }
    const id = barlineOrnamentGlyph(ornament.name)
    if (id !== undefined) output.push(registry.use(id, x - 46, y - 26))
  })
  if (barline?.temporaryMeter !== undefined) {
    output.push(registry.use('linshi_paihao_fenxian', x + 18, y))
    output.push(
      registry.use(`linshi_paihao_shuzi_${barline.temporaryMeter.numerator}`, x + 28, y - 12),
    )
    output.push(
      registry.use(`linshi_paihao_shuzi_${barline.temporaryMeter.denominator}`, x + 28, y + 12),
    )
  }
  return output
}

function renderUnderlines(
  layout: LineLayout,
  y: number,
  yForElement: (elementIndex: number) => number = () => y,
): string[] {
  const output: string[] = []
  const notes = layout.elements.filter(
    (positioned): positioned is PositionedElement & { element: NoteElement; beat: number } =>
      positioned.element.kind === 'note' &&
      positioned.beat !== undefined &&
      !positioned.element.hidden,
  )
  const groups = new Map<string, typeof notes>()
  notes.forEach((positioned) => {
    const key = `${positioned.measure}:${positioned.beat}:${yForElement(positioned.elementIndex)}`
    const group = groups.get(key) ?? []
    group.push(positioned)
    groups.set(key, group)
  })

  groups.forEach((items) => {
    const maxLines = Math.max(
      0,
      ...items.map(({ element }) => Math.max(0, Math.log2(element.duration / 4))),
    )
    for (let level = 1; level <= maxLines; level += 1) {
      let run: typeof items = []
      const flush = (): void => {
        if (run.length === 0) return
        const first = run[0]
        const last = run[run.length - 1]
        if (first !== undefined && last !== undefined) {
          // Duration underlines retain their native visual weight and span.
          // Only their first-row clearance changes for the smaller numerals.
          const underlineY = yForElement(first.elementIndex) + 10 + (level - 1) * 3.2
          output.push(
            `<line x1="${formatNumber(first.x - 7)}" y1="${formatNumber(underlineY)}" x2="${formatNumber(last.x + 7 + last.element.dots * 6)}" y2="${formatNumber(underlineY)}" data-type="jianshixian" stroke-width="1.6" stroke="${INK}"></line>`,
          )
        }
        run = []
      }
      items.forEach((item) => {
        if (Math.log2(item.element.duration / 4) >= level) run.push(item)
        else flush()
      })
      flush()
    }
  })
  return output
}

function inlineLayerRanges(
  line: ScoreLine,
): Array<{ start: number; end: number; closesWithinLine: boolean }> {
  return line.elements.flatMap((element, start) => {
    if (element.kind !== 'inline-layer' || element.role !== 'voice') return []
    const relativeBarline = line.elements
      .slice(start + 1)
      .findIndex((candidate) => candidate.kind === 'barline')
    const followingBarline = relativeBarline < 0 ? -1 : start + 1 + relativeBarline
    const end = followingBarline < 0 ? line.elements.length - 1 : followingBarline
    const closesWithinLine = line.elements.some(
      (candidate, index) =>
        index > end && (candidate.kind === 'note' || candidate.kind === 'sustain'),
    )
    return [{ start, end, closesWithinLine }]
  })
}

function mainElementY(layout: LineLayout, elementIndex: number, y: number): number {
  const insideTemporaryVoice = layout.inlineLayers.some((layer) => {
    if (layer.element.role !== 'voice') return false
    const end = layer.closingElementIndex ?? layout.line.elements.length - 1
    return (
      elementIndex > layer.elementIndex &&
      (layer.closesWithinLine === true ? elementIndex < end : elementIndex <= end)
    )
  })
  return insideTemporaryVoice ? y + 28 : y
}

function renderedElementY(layout: LineLayout, elementIndex: number, y: number): number {
  const element = layout.line.elements[elementIndex]
  return mainElementY(layout, elementIndex, y) +
    (element?.kind === 'note' ? chordCenterOffset(element) : 0)
}

function nearestMarkX(
  layout: LineLayout,
  index: number,
  direction: 'forward' | 'backward',
): number | undefined {
  const exact = layout.xByElement.get(index)
  if (exact !== undefined) return exact
  const candidates = [...layout.xByElement.entries()]
    .filter(([elementIndex]) =>
      direction === 'forward' ? elementIndex >= index : elementIndex <= index,
    )
    .sort(([left], [right]) => (direction === 'forward' ? left - right : right - left))
  return candidates[0]?.[1]
}

function renderMark(
  mark: Mark,
  layout: LineLayout,
  y: number,
  config: NumberedNotationLayout,
  registry: GlyphRegistry,
  liftOverride?: number,
): string[] {
  const start = nearestMarkX(layout, mark.start, 'forward')
  const end = nearestMarkX(layout, mark.end, 'backward')
  if (start === undefined || end === undefined) return []
  const x1 = start + 1
  const x2 = end - 1
  const markedElements = layout.line.elements.slice(mark.start, mark.end + 1)
  const markClearance = Math.max(
    markedElements.some(
      (element) =>
        element.kind === 'note' &&
        element.ornaments.some(({ name }) => name === 'yc' || name === 'ycy'),
    )
      ? 7
      : 0,
    ...markedElements.flatMap((element) =>
      element.kind === 'note' ? [
        chordTopClearance(element),
        element.accidental === undefined ? 0 : 7,
      ] : [],
    ),
  )
  const lift = liftOverride ?? mark.level * 8
  const top = y - 12 - lift - markClearance
  if (mark.type === 'slur' || mark.type === 'tuplet') {
    if (mark.continuationFromPrevious === true || mark.continuationToNext === true) {
      const flatY = y - 21.95 - lift - markClearance
      const left = start + 12
      const right = end - 12
      const lineStart = mark.continuationFromPrevious === true ? config.marginLeft - 3 : left + 0.8
      const lineEnd =
        mark.continuationToNext === true ? config.width - config.marginRight + 4 : right + 1
      const output: string[] = []
      if (mark.continuationFromPrevious !== true) {
        output.push(registry.use('lianyinxian_zuo', left, flatY))
      }
      if (mark.continuationToNext !== true) {
        output.push(registry.use('lianyinxian_you', right, flatY))
      }
      if (lineEnd > lineStart) {
        output.push(
          `<line x1="${formatNumber(lineStart)}" y1="${formatNumber(flatY + 0.75)}" x2="${formatNumber(lineEnd)}" y2="${formatNumber(flatY + 0.75)}" stroke-width="1.2" stroke="${INK}" fill="none"></line>`,
        )
      }
      return output
    }
    const span = x2 - x1
    const flat = mark.type === 'slur' && end - start > 100
    if (flat) {
      const left = start + 12
      const right = end - 12
      const flatY = y - 21.95 - lift - markClearance
      return [
        registry.use('lianyinxian_zuo', left, flatY),
        registry.use('lianyinxian_you', right, flatY),
        `<line x1="${formatNumber(left + 0.8)}" y1="${formatNumber(flatY + 0.75)}" x2="${formatNumber(right + 1)}" y2="${formatNumber(flatY + 0.75)}" stroke-width="1.2" stroke="${INK}" fill="none"></line>`,
      ]
    }
    const control = span * 0.3 - 0.4
    const path = `M ${formatNumber(x1)},${formatNumber(top)} C ${formatNumber(x1 + control)},${formatNumber(top - 10)},${formatNumber(x2 - control)},${formatNumber(top - 10)},${formatNumber(x2)},${formatNumber(top)} M ${formatNumber(x2)},${formatNumber(top)} C  ${formatNumber(x2 - control)},${formatNumber(top - 9)},${formatNumber(x1 + control)},${formatNumber(top - 9)},${formatNumber(x1)},${formatNumber(top)}`
    const output = [`<path d="${path}" stroke-width="0.5" stroke="${INK}"></path>`]
    if (
      mark.type === 'tuplet' &&
      mark.caption !== undefined &&
      /^\d+$/.test(mark.caption) &&
      Number(mark.caption) >= 2
    ) {
      output.push(registry.use(`lianyin_shuzi_${mark.caption}`, (x1 + x2) / 2, top - 7))
    }
    return output
  }
  if (mark.type === 'crescendo' || mark.type === 'decrescendo') {
    const left = start - 7
    const right = end + 7
    const middleY = y - 30 - mark.level * 5
    const leftSpread = mark.type === 'crescendo' ? 0 : 5
    const rightSpread = mark.type === 'crescendo' ? 5 : 0
    return [
      `<line x1="${formatNumber(left)}" y1="${formatNumber(middleY - leftSpread)}" x2="${formatNumber(right)}" y2="${formatNumber(middleY - rightSpread)}" stroke-width="1" stroke="${INK}" fill="none"></line>`,
      `<line x1="${formatNumber(left)}" y1="${formatNumber(middleY + leftSpread)}" x2="${formatNumber(right)}" y2="${formatNumber(middleY + rightSpread)}" stroke-width="1" stroke="${INK}" fill="none"></line>`,
    ]
  }
  const startElement = layout.line.elements[mark.start]
  const left =
    mark.continuationFromPrevious === true
      ? config.marginLeft - 4
      : start + (startElement?.kind === 'barline' && startElement.type === 'hidden' ? -6 : 2)
  const right = mark.continuationToNext === true ? config.width - config.marginRight + 4 : end - 2
  const voltaTop = y - 30 - mark.level * 10
  const output = [
    ...(mark.continuationFromPrevious === true
      ? []
      : [
          `<line x1="${formatNumber(left)}" y1="${formatNumber(voltaTop + 10)}" x2="${formatNumber(left)}" y2="${formatNumber(voltaTop)}" stroke-width="1" stroke="${INK}" fill="none"></line>`,
        ]),
    `<line x1="${formatNumber(left)}" y1="${formatNumber(voltaTop)}" x2="${formatNumber(right)}" y2="${formatNumber(voltaTop)}" stroke-width="1" stroke="${INK}" fill="none"></line>`,
  ]
  if (mark.openEnd !== true && mark.continuationToNext !== true) {
    output.push(
      `<line x1="${formatNumber(right)}" y1="${formatNumber(voltaTop + 10)}" x2="${formatNumber(right)}" y2="${formatNumber(voltaTop)}" stroke-width="1" stroke="${INK}" fill="none"></line>`,
    )
  }
  if (mark.caption !== undefined && mark.continuationFromPrevious !== true) {
    output.push(
      text(mark.caption, left + 3, voltaTop + 10, {
        font: 'Microsoft YaHei',
        size: 12,
        fill: '#303030',
        dy: 0.3355 * 12,
        extra: { 'xml:space': 'preserve' },
      }),
    )
  }
  return output
}

function curvedMarkLifts(marks: Mark[]): Map<Mark, number> {
  const lifts = new Map<Mark, number>()
  marks
    .filter(({ type }) => type === 'slur' || type === 'tuplet')
    .forEach((mark) => {
      let lift = mark.level * 8
      lifts.forEach((otherLift, other) => {
        if (mark.start >= other.end || other.start >= mark.end) return
        const step = mark.start === other.start && mark.end === other.end ? 5 : 8
        lift = Math.max(lift, otherLift + step)
      })
      lifts.set(mark, lift)
    })
  return lifts
}

function renderLyrics(
  layout: LineLayout,
  pageIndex: number,
  lineOrdinal: number,
  y: number,
  config: NumberedNotationLayout,
  registry: GlyphRegistry,
  musicToLyric: number,
  lyricToLyric: number,
): string[] {
  const output: string[] = []
  const ordinals = itemOrdinals(layout.line)
  const notePositions = layout.line.elements.flatMap((element, index) => {
    if (element.kind !== 'note') return []
    const x = layout.xByElement.get(index)
    return x === undefined ? [] : [{
      x,
      ordinal: ordinals.get(index) ?? 0,
      m3nDataId: element.m3nDataId ?? element.m3nId,
    }]
  })
  layout.line.lyrics.forEach((lyric, lyricIndex) => {
    const lyricY = y + 15 + musicToLyric + lyricIndex * (config.lyricSize + lyricToLyric)
    const lyricPitch = config.lyricSize + lyricToLyric
    if (lyric.annotation !== undefined) {
      output.push(
        text(lyric.annotation, (notePositions[0]?.x ?? config.marginLeft) - 6, lyricY, {
          font: config.lyricFont,
          size: config.lyricSize,
          anchor: 'end',
          fill: '#101010',
          dy: 0.3355 * config.lyricSize,
        }),
      )
    }
    notePositions.forEach((positioned, index) => {
      const syllable = lyric.syllables[index]
      if (syllable?.leftBrace === true || syllable?.rightBrace === true) {
        const id = syllable.leftBrace === true ? 'ci_dakuohu_zuo' : 'ci_dakuohu_you'
        const braceX = positioned.x + (syllable.leftBrace === true ? -9 : 9)
        const braceLine = Math.max(0, lyricIndex - 1)
        const braceY = y + 15 + musicToLyric + braceLine * lyricPitch + lyricPitch * 0.75 - 4.2
        registry.register(id)
        output.push(
          `<use cx="0" cy="0" xlink:href="#${id}" transform="translate(${formatNumber(braceX)},${formatNumber(braceY)})scale(1,${formatNumber(lyricPitch * 0.15)})" xmlns:xlink="http://www.w3.org/1999/xlink"></use>`,
        )
      }
      if (syllable?.text === '') return
      const value = syllable?.text ?? ''
      const playbackExtra: Readonly<Record<string, string>> = positioned.m3nDataId === undefined
        ? {}
        : {
          'data-m3n-id': positioned.m3nDataId,
          'data-m3n-rendition': String(lyric.rendition ?? 1),
          'data-m3n-role': 'lyric',
          }
      output.push(
        text(value, positioned.x - config.lyricSize / 2, lyricY, {
          font: config.lyricFont,
          size: config.lyricSize,
          fill: '#101010',
          dy: 0.3355 * config.lyricSize,
          extra: { cipos: notePositionCode(pageIndex, lineOrdinal, positioned.ordinal), ...playbackExtra },
        }),
      )
      if (syllable?.trailingPunctuation !== undefined) {
        const characters = [...value]
        const rightOffset = characters.reduce((sum, character, characterIndex) => {
          const ascii = isAscii(character)
          if (ascii) return sum + config.lyricSize * 0.25
          return sum + config.lyricSize * (characterIndex === 0 ? 0.5 : 1)
        }, 0)
        const punctuationOffset = isAscii(syllable.trailingPunctuation) ? 1.8 : 0
        output.push(
          text(
            syllable.trailingPunctuation,
            positioned.x + rightOffset + punctuationOffset,
            lyricY,
            {
              font: config.lyricFont,
              size: config.lyricSize,
              fill: '#101010',
              dy: 0.3355 * config.lyricSize,
              extra: playbackExtra,
            },
          ),
        )
      }
    })
  })
  return output
}

function renderInlineLayer(
  layer: InlineLayerElement,
  startX: number,
  y: number,
  pageIndex: number,
  config: NumberedNotationLayout,
  registry: GlyphRegistry,
  nextGraceId: (prefix: 'qy' | 'hy') => string,
  layout?: LineLayout,
  closesWithinLine = false,
): string[] {
  const output: string[] = []
  if (layout !== undefined) {
    layout.elements.forEach((positioned) => {
      const element = positioned.element
      if (element.kind === 'barline') return
      if (element.kind === 'note') {
        if (layer.role === 'voice') {
          output.push(
            ...renderNote(
              element,
              positioned.x,
              y,
              `${pageIndex}__`,
              config,
              registry,
              undefined,
              undefined,
              {},
              nextGraceId,
            ),
          )
        } else if (!element.hidden) {
          const id =
            element.pitch === 9 ? 'shuzi_x' : `shuzi_${config.numberStyle}_bian_${element.pitch}`
          output.push(registry.use(id, positioned.x, y))
          output.push(...renderInlineOrnaments(element.ornaments, positioned.x, y, registry, config))
        }
      } else if (layer.role === 'voice') {
        output.push(...renderSustain(element, positioned.x, y, `${pageIndex}__`, registry, config))
      } else {
        output.push(registry.use('yanyinfu', positioned.x, y))
      }
    })
    layout.barlines.forEach((barline, index) => {
      if (closesWithinLine && index === layout.barlines.length - 1) return
      if (barline.element?.type === 'hidden' || barline.element?.type === 'invisible') return
      output.push(
        registry.use(
          barline.synthetic
            ? 'xiaojiexian_weibu'
            : BARLINE_GLYPH_IDS[barline.element?.type ?? 'normal'],
          barline.x,
          y,
        ),
      )
    })
    output.push(...renderUnderlines(layout, y, (elementIndex) => renderedElementY(layout, elementIndex, y)))
    layout.line.marks.forEach((mark) =>
      output.push(...renderMark(mark, layout, y, config, registry)),
    )
    return output
  }
  // `layout` is absent only for a terminal inline layer.
  void startX
  return output
}

function renderLine(
  layout: LineLayout,
  pageIndex: number,
  lineOrdinal: number,
  y: number,
  config: NumberedNotationLayout,
  registry: GlyphRegistry,
  musicToLyric: number,
  lyricToLyric: number,
  nextGraceId: (prefix: 'qy' | 'hy') => string,
): string[] {
  const output: string[] = []
  const measureOutput = new Map<number, string[]>()
  const outputForMeasure = (measure: number) => {
    const existing = measureOutput.get(measure)
    if (existing !== undefined) return existing
    const created: string[] = []
    measureOutput.set(measure, created)
    return created
  }
  const ordinals = itemOrdinals(layout.line)
  layout.elements.forEach((positioned) => {
    if (positioned.element.kind === 'barline') return
    const elementY = mainElementY(layout, positioned.elementIndex, y)
    const ordinal = ordinals.get(positioned.elementIndex) ?? 0
    const notepos = notePositionCode(pageIndex, lineOrdinal, ordinal)
    if (positioned.element.kind === 'note') {
      const tuplet = layout.line.marks.find(
        (mark) =>
          mark.type === 'tuplet' &&
          positioned.elementIndex >= mark.start &&
          positioned.elementIndex <= mark.end,
      )
      const timeOverride =
        tuplet === undefined ? undefined : playbackTime(positioned.element, tuplet)
      const tie = layout.line.marks.find(
        (mark) => mark.type === 'slur' && mark.end === positioned.elementIndex,
      )
      const tieStart = tie === undefined ? undefined : layout.line.elements[tie.start]
      const audioOverride =
        tieStart?.kind === 'sustain' ||
        (tieStart?.kind === 'note' &&
          tieStart.pitch === positioned.element.pitch &&
          tieStart.octave === positioned.element.octave)
          ? '0'
          : undefined
      const hairpinStart = layout.line.marks.some(
        (mark) =>
          (mark.type === 'crescendo' || mark.type === 'decrescendo') &&
          mark.start === positioned.elementIndex,
      )
      const hairpinEnd = layout.line.marks.some(
        (mark) =>
          (mark.type === 'crescendo' || mark.type === 'decrescendo') &&
          mark.end === positioned.elementIndex,
      )
      const slurEnd = layout.line.marks.some(
        (mark) => mark.type === 'slur' && mark.end === positioned.elementIndex,
      )
      outputForMeasure(positioned.measure).push(
        ...renderNote(
          positioned.element,
          positioned.x,
          elementY,
          notepos,
          config,
          registry,
          timeOverride,
          audioOverride,
          { hairpinStart, hairpinEnd, slurEnd },
          nextGraceId,
        ),
      )
    } else {
      const tuplet = layout.line.marks.find(
        (mark) =>
          mark.type === 'tuplet' &&
          positioned.elementIndex >= mark.start &&
          positioned.elementIndex <= mark.end,
      )
      const timeOverride =
        tuplet === undefined ? undefined : playbackTime(positioned.element, tuplet)
      outputForMeasure(positioned.measure).push(
        ...renderSustain(
          positioned.element,
          positioned.x,
          elementY,
          notepos,
          registry,
          config,
          timeOverride,
        ),
      )
    }
  })

  const syntheticOrdinal = Math.max(0, ...ordinals.values()) + 1
  layout.barlines.forEach((barline) => {
    const ordinal =
      barline.elementIndex === undefined
        ? syntheticOrdinal
        : (ordinals.get(barline.elementIndex) ?? syntheticOrdinal)
    outputForMeasure(barline.measure).push(
      ...renderBarline(
        barline.element,
        barline.synthetic,
        barline.x,
        barline.elementIndex === undefined ? y : mainElementY(layout, barline.elementIndex, y),
        notePositionCode(pageIndex, lineOrdinal, ordinal),
        registry,
        config,
      ),
    )
  })
  measureOutput.forEach((measure, measureIndex) => {
    const firstElementX = layout.elements.find((positioned) => positioned.measure === measureIndex)?.x
    const previousBarlineX = measureIndex > 0
      ? layout.barlines.find((barline) => barline.measure === measureIndex - 1)?.x
      : undefined
    const measureStart = previousBarlineX ?? firstElementX ?? config.marginLeft
    const measureEnd = layout.barlines.find((barline) => barline.measure === measureIndex)?.x
    const measureBounds = `data-m3n-measure-start="${formatNumber(measureStart)}"${measureEnd === undefined ? '' : ` data-m3n-measure-end="${formatNumber(measureEnd)}"`}`
    output.push(`<g class="measure" ${measureBounds}>${measure.join('\n')}</g>`)
  })
  output.push(
    ...renderUnderlines(layout, y, (elementIndex) => renderedElementY(layout, elementIndex, y)),
  )
  const markLifts = curvedMarkLifts(layout.line.marks)
  layout.line.marks.forEach((mark) =>
    output.push(
      ...renderMark(
        mark,
        layout,
        mainElementY(layout, mark.start, y),
        config,
        registry,
        markLifts.get(mark),
      ),
    ),
  )
  output.push(
    ...renderLyrics(
      layout,
      pageIndex,
      lineOrdinal,
      y + musicBottomPadding(layout.line),
      config,
      registry,
      musicToLyric,
      lyricToLyric,
    ),
  )
  layout.inlineLayers.forEach(
    ({
      element,
      x,
      layout: inlineLayout,
      braceStartX,
      braceEndX,
      closesWithinLine,
      fullHeightRightBrace,
    }) => {
      output.push(
        ...renderInlineLayer(
          element,
          x,
          y + (element.role === 'accompaniment' ? -24 : -16.8),
          pageIndex,
          config,
          registry,
          nextGraceId,
          inlineLayout,
          closesWithinLine,
        ),
      )
      if (braceStartX !== undefined) {
        output.push(registry.use('dakuohu_zuo_2', braceStartX, y))
      }
      if (braceEndX !== undefined) {
        output.push(
          registry.use(
            fullHeightRightBrace === true ? 'dakuohu_you_2' : 'dakuohu_you_',
            braceEndX,
            y,
          ),
        )
      }
    },
  )
  return output
}

function rowAdvance(
  line: ScoreLine,
  config: NumberedNotationLayout,
  spacing: ReturnType<typeof pageSpacing>,
): number {
  const lyricHeight =
    line.lyrics.length === 0
      ? 0
      : spacing.musicToLyric +
        line.lyrics.length * config.lyricSize +
        Math.max(0, line.lyrics.length * spacing.lyricToLyric - 6)
  const musicHeight = (line.lyrics.length === 0 ? 22.8 : 21) + musicBottomPadding(line)
  return musicHeight + lyricHeight + spacing.lineGap
}

function musicBottomPadding(line: ScoreLine): number {
  const temporaryVoiceRanges = inlineLayerRanges(line)
  return Math.max(
    0,
    ...line.elements.flatMap((element, index) => {
      if (element.kind !== 'note') return []
      const insideTemporaryVoice = temporaryVoiceRanges.some(({ start, end, closesWithinLine }) =>
        index > start && (closesWithinLine ? index < end : index <= end),
      )
      const noteY = chordCenterOffset(element) + (insideTemporaryVoice ? 28 : 0)
      const underlineCount = Math.max(0, Math.log2(element.duration / 4))
      const lowestOctaveDot = element.octave < 0
        ? lowerOctaveDotY(noteY, underlineCount, Math.abs(element.octave) - 1) + OCTAVE_DOT_DIAMETER / 2
        : noteY
      // The normal numeral already occupies the baseline's bottom extent.
      // Only marks extending below it need to move the lyric baseline.
      const underlineBottom = underlineCount > 0
        ? noteY + 10 + (underlineCount - 1) * 3.2 + 0.8
        : noteY + 7.2
      return [Math.max(lowestOctaveDot, underlineBottom) - 7.2]
    }),
  )
}

function curvedMarkTopPadding(line: ScoreLine): number {
  const lifts = curvedMarkLifts(line.marks)
  return Math.max(
    0,
    ...line.marks.flatMap((mark) => {
      if (mark.type !== 'slur' && mark.type !== 'tuplet') return []
      const markedNotes = line.elements.slice(mark.start, mark.end + 1)
        .filter((element): element is NoteElement => element.kind === 'note')
      const clearance = Math.max(
        ...markedNotes.map((note) => Math.max(
          chordTopClearance(note),
          note.accidental === undefined ? 0 : 7,
          note.ornaments.some(({ name }) => name === 'yc' || name === 'ycy') ? 7 : 0,
        )),
        0,
      )
      // Curved marks rise ten units above their anchor; the flatter continued
      // variant needs the same conservative allowance.
      return [22 + (lifts.get(mark) ?? mark.level * 8) + clearance]
    }),
  )
}

function lineTopPadding(line: ScoreLine): number {
  const upperOrnamentPadding = Math.max(
    0,
    ...line.elements.flatMap((element) =>
      element.kind === 'note'
        ? [
            element.ornaments.some((ornament) => DYNAMIC_ORNAMENTS.has(ornament.name))
              ? 60 + chordTopClearance(element)
              : 0,
            element.ornaments.some((ornament) => ornament.name === 'tr')
              ? 34 + chordTopClearance(element)
              : 0,
            element.annotation === undefined ? 0 : 44 + chordTopClearance(element),
            element.sectionLabel === undefined ? 0 : 64 + chordTopClearance(element),
            element.keyChange === undefined ? 0 : 28 + chordTopClearance(element),
          ]
        : element.kind === 'sustain' && element.ornaments.some((ornament) => DYNAMIC_ORNAMENTS.has(ornament.name))
          ? [60]
          : [],
    ),
  )
  const symbolPadding = line.marks.some(
    ({ type }) => type === 'volta' || type === 'crescendo' || type === 'decrescendo',
  )
    ? 7.2
    : 0
  const layerPadding = Math.max(
    0,
    ...line.elements.flatMap((element) =>
      element.kind === 'inline-layer' ? [element.role === 'accompaniment' ? 24 : 16.8] : [],
    ),
  )
  const chordPadding = Math.max(
    0,
    ...line.elements.flatMap((element) =>
      element.kind === 'note' && element.chordPitches !== undefined
        ? [chordTopClearance(element) + 7.2]
        : [],
    ),
  )
  return Math.max(upperOrnamentPadding, symbolPadding, layerPadding, chordPadding, curvedMarkTopPadding(line))
}

function groupAdvance(
  group: ScorePage['groups'][number],
  config: NumberedNotationLayout,
  spacing: ReturnType<typeof pageSpacing>,
): number {
  const rows = group.voices.reduce(
    (height, line) => height + lineTopPadding(line) + rowAdvance(line, config, spacing),
    0,
  )
  return rows + (group.voices.length > 1 ? spacing.voiceGap : 0)
}

/**
 * Splits voice groups using the exact vertical advances used by renderPage.
 * Hosts that construct ScoreDocument directly can use this instead of making
 * page breaks from a fixed number of systems.
 */
export function paginateVoiceGroups(
  groups: ScorePage['groups'],
  metadata: Metadata,
  config: NumberedNotationLayout,
): ScorePage[] {
  const output: ScorePage[] = []
  let pageIndex = 0
  let groupIndex = 0
  while (groupIndex < groups.length) {
    const header =
      pageIndex === 0
        ? renderHeader(metadata, config)
        : { bodyY: config.marginTop + config.bodyMarginTop + 6 }
    const spacing = pageSpacing(config)
    const bottom = config.height - config.marginBottom
    let y = header.bodyY
    const pageGroups: ScorePage['groups'] = []
    while (groupIndex < groups.length) {
      const group = groups[groupIndex]
      if (group === undefined) break
      const advance = groupAdvance(group, config, spacing)
      if (pageGroups.length > 0 && y + advance > bottom) break
      pageGroups.push(group)
      y += advance
      groupIndex += 1
    }
    if (pageGroups.length === 0 && groups[groupIndex] !== undefined) {
      pageGroups.push(groups[groupIndex] as ScorePage['groups'][number])
      groupIndex += 1
    }
    output.push({ index: pageIndex, groups: pageGroups })
    pageIndex += 1
  }
  return output
}

/** Returns the height needed to render all groups continuously on one SVG page. */
export function continuousPageHeight(
  groups: ScorePage['groups'],
  metadata: Metadata,
  config: NumberedNotationLayout,
  // groupAdvance already includes each rendered lyric row and its line spacing.
  bottomPadding = 4,
): number {
  const header = renderHeader(metadata, config)
  const spacing = pageSpacing(config)
  return Math.ceil(
    header.bodyY + groups.reduce((height, group) => height + groupAdvance(group, config, spacing), 0) + bottomPadding,
  )
}

function renderPage(
  page: ScorePage,
  metadata: Metadata,
  config: NumberedNotationLayout,
): string {
  const registry = new GlyphRegistry()
  const header =
    page.index === 0
      ? renderHeader(metadata, config)
      : { markup: [], bodyY: config.marginTop + config.bodyMarginTop + 6 }
  const body: string[] = [...header.markup]
  const spacing = pageSpacing(config)
  let y = header.bodyY
  let lineOrdinal = 1
  let graceOrdinal = 0
  const nextGraceId = (prefix: 'qy' | 'hy'): string => `${prefix}${graceOrdinal++}_${page.index}`

  page.groups.forEach((group) => {
    const multiVoice = group.voices.length > 1
    const captionWidth = Math.max(
      0,
      ...group.voices.map((voice) =>
        [...(voice.caption ?? '')].reduce(
          (width, character) => width + (isAscii(character) ? 4.8 : 9.6),
          0,
        ),
      ),
    )
    const hasCaption = group.voices.some(({ caption }) => caption !== undefined && caption !== '')
    const voiceColumnWidth = !multiVoice ? 0 : hasCaption ? 15.6 + captionWidth : 12
    const hasExplicitVoiceBrace = group.voices.some(({ elements }) =>
      elements.some(
        (element) =>
          element.kind === 'barline' && element.ornaments.some(({ name }) => name === 'sbf'),
      ),
    )
    const startX =
      config.marginLeft + 1.8 + (multiVoice && !hasExplicitVoiceBrace ? voiceColumnWidth : 0)
    const layout = layoutVoiceGroup(
      group,
      startX,
      config.width - config.marginRight + 1.8,
      hasExplicitVoiceBrace ? voiceColumnWidth : 0,
      group.forceJustify,
    )
    let firstY = y
    let lastY = y
    layout.lines.forEach((lineLayout, index) => {
      const scoreLine = lineLayout.line
      y += lineTopPadding(scoreLine)
      if (index === 0) firstY = y
      if (multiVoice) {
        body.push(
          text(scoreLine.caption ?? '', (layout.voiceBraceX ?? startX) - 21, y, {
            font: config.lyricFont,
            size: config.lyricSize,
            anchor: 'end',
            fill: '#101010',
            dy: 0.3355 * config.lyricSize,
          }),
        )
      }
      body.push(
        ...renderLine(
          lineLayout,
          page.index,
          lineOrdinal,
          y,
          config,
          registry,
          spacing.musicToLyric,
          spacing.lyricToLyric,
          nextGraceId,
        ),
      )
      lineOrdinal += 1
      lastY = y
      y += rowAdvance(scoreLine, config, spacing)
      if (index === layout.lines.length - 1) return
    })
    if (multiVoice) {
      const braceX = layout.voiceBraceX ?? startX
      // The brace caps terminate at x=-27.3 in their native coordinate system.
      // Anchor the double bar to that endpoint rather than the cap's midpoint.
      const braceStemX = braceX - 21.84
      const braceInnerStemX = braceStemX + 2.16
      body.push(`<path d="M ${formatNumber(braceX - 14.32)},${formatNumber(firstY - 10.4)} C ${formatNumber(braceX - 14.32)},${formatNumber(firstY - 10.4)} ${formatNumber(braceX - 15.12)},${formatNumber(firstY - 6)} ${formatNumber(braceStemX)},${formatNumber(firstY - 4.48)}" stroke="${INK}" stroke-width="1.6" fill="none"></path>`)
      body.push(
        `<line x1="${formatNumber(braceStemX)}" y1="${formatNumber(firstY - 4.48)}" x2="${formatNumber(braceStemX)}" y2="${formatNumber(lastY + 4.56)}" stroke-width="1.92" stroke="${INK}" fill="none"></line>`,
      )
      body.push(
        `<line x1="${formatNumber(braceInnerStemX)}" y1="${formatNumber(firstY - 5.2)}" x2="${formatNumber(braceInnerStemX)}" y2="${formatNumber(lastY + 5.28)}" stroke-width="0.96" stroke="${INK}" fill="none"></line>`,
      )
      body.push(`<path d="M ${formatNumber(braceX - 14.2)},${formatNumber(lastY + 10.72)} C ${formatNumber(braceX - 14.2)},${formatNumber(lastY + 10.72)} ${formatNumber(braceX - 15)},${formatNumber(lastY + 6.14)} ${formatNumber(braceStemX + 0.12)},${formatNumber(lastY + 4.56)}" stroke="${INK}" stroke-width="1.6" fill="none"></path>`)
    }
    if (multiVoice) y += spacing.voiceGap
  })

  const musicFontStyle = config.musicFontCss === undefined ? '' : `<style type="text/css">${config.musicFontCss}</style>`
  return `<svg width="${formatNumber(config.width)}" height="${formatNumber(config.height)}" version="1.1" viewBox="0 0 ${formatNumber(config.width)} ${formatNumber(config.height)}" encoding="UTF-8" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" height="100%" width="100%" fill="#ffffff"></rect>${musicFontStyle}${registry.definitions()}\n${body.join('\n')}</svg>`
}

export function renderNumberedNotationPages(
  document: ScoreDocument,
  layout: NumberedNotationLayout,
): string[] {
  return document.pages.map((page) =>
    renderPage(page, document.metadata, layout).replace(
      '</defs>',
      `${NUMBERED_PLAYBACK_HIGHLIGHT_FILTER}</defs>`,
    ).replace(
      ' xmlns="http://www.w3.org/2000/svg"',
      ' xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"',
    ),
  )
}
