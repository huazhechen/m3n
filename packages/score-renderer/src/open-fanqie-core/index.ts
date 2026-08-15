export { parse } from './parser.js'
export { render, renderDocumentSvgPages, renderSvgPages } from './renderer.js'
export { DEFAULT_PAGE_CONFIG } from './config.js'
export type {
  Accidental,
  BarlineElement,
  BarlineType,
  BeatBoundaryElement,
  Diagnostic,
  InlineLayerElement,
  LegacyPageConfig,
  LyricLine,
  LyricSyllable,
  Mark,
  Metadata,
  Meter,
  MusicElement,
  NoteElement,
  NumberStyle,
  Ornament,
  PagePreset,
  RenderOptions,
  ScoreDocument,
  ScoreLine,
  ScorePage,
  SourceLocation,
  SustainElement,
  SvgRenderOptions,
  VoiceGroup,
} from './types.js'

export const VERSION = '0.1.0'
