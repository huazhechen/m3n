export type ScoreEvent = { 
  /** Stable event identity when unfolding an alternative performance. */
  playbackId?: string
  sourceStart: number
  sourceEnd: number
  kind: 'note' | 'chord' | 'rest' | 'tuplet'
  pitches: string[]
  key: string
  beats: number
  tie: boolean
  tieFromTupletIndex?: number
  dynamic?: string
  chord?: string
  prefix?: 'sfz'
  text?: string
  postfixes: string[]
  navigation: Array<'segno' | 'ds' | 'dc' | 'fine'>
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
  /** Local visits from an explicit section order; absent for ordinary repeats. */
  orderPasses?: number[]
  sectionName?: string
  events: ScoreEvent[]
  navigation?: Array<'segno' | 'ds' | 'dc' | 'fine'>
  left?: string
  right?: string
  ending?: string
  breakBefore?: boolean
  breakAfter?: boolean
  multiRest?: number
  /** Settings at the onset of a rest-only measure, which has no ScoreEvent. */
  multiRestState?: { key: string; meterCount: number; meterUnit: number; tempo: number }
  repeatCount?: number
  barEnd?: number
}

export type ScoreAlternative = {
  passes: number[]
  host: ScoreMeasure
  measure: ScoreMeasure
  intervals: ScoreInterval[]
  sourceStart: number
  sourceEnd: number
}

export type ScorePart = { melody: ScoreMeasure[]; bass: ScoreMeasure[] }
export type ScoreLyricSyllable = { text: string; sourceStart: number; sourceEnd: number; forceTiedTarget: boolean; kind: 'text' | 'placeholder' | 'extender'; underlined: boolean; wordpos?: 'i' | 'm' | 't' }
export type ScoreLyricBlock = {
  /** Internal projection of shared lyrics onto a particular alternative visit. */
  alternativePass?: number
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
  alternatives?: ScoreAlternative[]
  /** Equal visible measure widths within each numbered-notation system. */
  equalMeasures?: boolean
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
