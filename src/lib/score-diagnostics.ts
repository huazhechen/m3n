export type ScoreDiagnosticSeverity = 'none' | 'lyric' | 'error'

export function scoreDiagnosticSeverity(diagnostics: readonly string[]): ScoreDiagnosticSeverity {
  if (diagnostics.length === 0) return 'none'
  return diagnostics.every((diagnostic) => diagnostic.startsWith('[L]')) ? 'lyric' : 'error'
}
