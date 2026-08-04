export type ScoreEvent = {
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
  chordState?: string
  prefix?: 'sfz'
  postfixes: string[]
  navigation: Array<'segno' | 'ds' | 'dc' | 'fine'>
  octaveShift: number
  sectionLabel?: string
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
  start?: number
  end?: number
  endStart?: number
}

export type ScoreMeasure = {
  events: ScoreEvent[]
  left?: string
  right?: string
  ending?: string
  breakBefore?: boolean
  breakAfter?: boolean
  multiRest?: number
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
  targetStart?: number
  targetEnd?: number
}

/** Canonical musical meaning of a source document, independent of textual layout. */
export type ScoreDocument = {
  title: string
  subtitle: string
  singer: string
  composer: string
  lyricist: string
  arranger: string
  copyright: string
  source: string
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
