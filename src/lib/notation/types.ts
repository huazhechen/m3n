import type { ScoreDiagnostic } from './diagnostics'

export type NotationMode = 'm3n'

export type SourceMapRange = {
  outputStart: number
  outputEnd: number
  sourceStart: number
  sourceEnd: number
}

export type ConversionResult = {
  source: string
  output: string
  diagnostics: string[]
  diagnosticDetails: ScoreDiagnostic[]
  sourceMap?: SourceMapRange[]
}
