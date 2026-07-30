export type NotationMode = 'm3n' | 'abc'

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
  sourceMap?: SourceMapRange[]
}
