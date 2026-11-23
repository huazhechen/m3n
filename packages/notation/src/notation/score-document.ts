import type { PlaybackNavigation } from './repeats.js'

export type ScoreEvent = { 
  /** Stable event identity when unfolding a performed visit. */
  playbackId?: string
  sourceStart: number
  sourceEnd: number
  kind: 'note' | 'chord' | 'rest' | 'tuplet'
  pitches: string[]
  key: string
  /** Absolute key for each numbered playback pass, inherited until the next key directive. */
  keyPasses?: readonly string[]
  beats: number
  tie: boolean
  tieFromTupletIndex?: number
  /** Outgoing ties between adjacent children within a tuplet. */
  tupletTies?: number[]
  dynamic?: string
  chord?: string
  prefix?: 'sfz'
  text?: string
  postfixes: string[]
  navigation: PlaybackNavigation[]
  octaveShift: number
  sectionLabel?: string
  sectionLabelBreakAfter?: boolean
  meterCount?: number
  meterUnit?: number
  tempo?: number
  tuplet?: { num: number; numbase: number; unitBeats: number }
}

export type ScoreInterval = {
  id: number
  staff: 'melody' | 'bass'
  kind: 'cresc' | 'decres' | 'lg' | '8va' | '8vb' | 'accel' | 'rit' | 'inst'
  tempoTarget?: number
  display?: 'text'
  start?: number
  end?: number
  endStart?: number
}

export type ScoreMeasure = {
  /** Zero-based occurrence in the explicit order, on unfolded measures only. */
  orderIndex?: number
  /** Local visits from an explicit section order; absent for ordinary repeats. */
  orderPasses?: number[]
  sectionName?: string
  events: ScoreEvent[]
  navigation?: PlaybackNavigation[]
  left?: string
  right?: string
  ending?: string
  breakBefore?: boolean
  breakAfter?: boolean
  /** Unmeasured instrumental passage: visible, unnumbered and silent in playback. */
  interlude?: boolean
  multiRest?: number
  /** Settings at the onset of a rest-only measure, which has no ScoreEvent. */
  multiRestState?: { key: string; keyPasses?: readonly string[]; meterCount: number; meterUnit: number; tempo: number }
  repeatCount?: number
  barEnd?: number
}

export type ScorePart = { melody: ScoreMeasure[]; bass: ScoreMeasure[] }
export type ScoreLyricSyllable = { text: string; sourceStart: number; sourceEnd: number; forceTiedTarget: boolean; kind: 'text' | 'placeholder' | 'extender'; underlined: boolean; wordpos?: 'i' | 'm' | 't' }
export type ScoreLyricBlock = {
  range: string
  mode: 'char' | 'word'
  syllables: ScoreLyricSyllable[]
  phrasePasses?: string
  /** Explicitly shared lyric passes (for example a V2,V4 phrase or L4: {L2}). */
  sharedPasses?: string
  targetStart?: number
  targetEnd?: number
}

/** Canonical musical meaning of a source document, independent of textual layout. */
export type ScoreDocument = {
  /** Equal visible measure widths within each engraved system. */
  equalMeasures?: boolean
  /** Minimum vertical core clearance in music-font em; defaults to 1.2 throughout the score. */
  minimumCoreGapEm?: number
  /** Written sections are printed once; order determines performance visits. */
  order?: string[]
  /** Optional target keys, indexed by outer section visit in order. */
  orderKeys?: Array<string | undefined>
  /** Optional target octave bases (4 by default), indexed by section visit. */
  orderKeyOctaves?: Array<number | undefined>
  sections?: ReadonlyArray<{ name: string; start: number; end: number }>
  /** Written phrase ranges for local engraving; they do not change playback. */
  paragraphs?: ReadonlyArray<{ id: string; start: number; end: number }>
  title: string
  subtitle: string
  singer: string
  composer: string
  lyricist: string
  arranger: string
  origin: string
  copyright: string
  note: string
  transpose: string
  key: string
  meterCount: number
  meterUnit: number
  tempo: number
  hasExplicitTempo: boolean
  lyrics: ScoreLyricBlock[]
  parts: Map<string, ScorePart>
  intervals: ScoreInterval[]
}
