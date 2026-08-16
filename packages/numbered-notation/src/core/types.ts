export interface SourceLocation {
  line: number
  column: number
  offset: number
  length: number
}

export type DiagnosticSeverity = 'warning' | 'error'

export interface Diagnostic {
  severity: DiagnosticSeverity
  code: string
  message: string
  source: SourceLocation
}

export interface Meter {
  numerator: number
  denominator: number
  parenthesized: boolean
}

export type Tempo = number | string

export interface Metadata {
  version?: string
  titles: string[]
  authors: string[]
  mode?: string
  meters: Meter[]
  tempos: Tempo[]
  instruments: string[]
  remarks: string[]
}

export type Accidental = 'sharp' | 'flat' | 'natural'

export interface Ornament {
  name: string
  level: number
}

export interface NoteElement {
  kind: 'note'
  pitch: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 9
  sound: 'note' | 'rest' | 'rhythm'
  hidden: boolean
  octave: number
  duration: number
  dots: number
  accidental?: Accidental
  ornaments: Ornament[]
  graceBefore?: NoteElement[]
  graceAfter?: NoteElement[]
  annotation?: string
  code: string
  /** Host-owned stable event ID. */
  m3nId?: string
  /** Host-owned parent event id when one event expands to several visual notes. */
  m3nDataId?: string
  /** Additional simultaneous pitches anchored to this note's rhythmic slot. */
  chordPitches?: Array<{ pitch: 1 | 2 | 3 | 4 | 5 | 6 | 7; octave: number; accidental?: Accidental }>
  source: SourceLocation
}

export interface SustainElement {
  kind: 'sustain'
  duration: 4
  ornaments: Ornament[]
  code: string
  source: SourceLocation
}

export type BarlineType =
  | 'normal'
  | 'end'
  | 'double'
  | 'repeat-start'
  | 'repeat-end'
  | 'repeat-both'
  | 'hidden'
  | 'invisible'

export interface BarlineElement {
  kind: 'barline'
  type: BarlineType
  ornaments: Ornament[]
  temporaryMeter?: Meter
  annotation?: string
  code: string
  source: SourceLocation
}

export interface BeatBoundaryElement {
  kind: 'beat-boundary'
  behavior: 'join' | 'split'
  code: '~' | '^'
  source: SourceLocation
}

export interface InlineLayerElement {
  kind: 'inline-layer'
  role: 'accompaniment' | 'voice'
  elements: MusicElement[]
  marks: Mark[]
  code: string
  source: SourceLocation
}

export type MusicElement =
  NoteElement | SustainElement | BarlineElement | BeatBoundaryElement | InlineLayerElement

export type MarkType = 'slur' | 'tuplet' | 'crescendo' | 'decrescendo' | 'volta'

export interface Mark {
  type: MarkType
  start: number
  end: number
  level: number
  caption?: string
  openEnd?: boolean
  continuationFromPrevious?: boolean
  continuationToNext?: boolean
  source: SourceLocation
}

export interface LyricSyllable {
  text: string
  trailingPunctuation?: string
  leftBrace?: boolean
  rightBrace?: boolean
  source: SourceLocation
}

export interface LyricLine {
  annotation?: string
  syllables: LyricSyllable[]
  source: SourceLocation
}

export interface ScoreLine {
  voice: number
  caption?: string
  elements: MusicElement[]
  marks: Mark[]
  lyrics: LyricLine[]
  raw: string
  source: SourceLocation
}

export interface VoiceGroup {
  index: number
  voices: ScoreLine[]
  /** Request the renderer's normal justified-fit pass for an auto-wrapped system. */
  forceJustify?: boolean
}

export interface ScorePage {
  index: number
  groups: VoiceGroup[]
}

export interface ScoreDocument {
  metadata: Metadata
  pages: ScorePage[]
}

export type FontFamily = 'Microsoft YaHei' | 'SimSun' | 'SimHei' | 'KaiTi'
export type NumberStyle = 'a' | 'b' | 'c'
