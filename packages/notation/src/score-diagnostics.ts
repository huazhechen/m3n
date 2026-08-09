import type { ScoreDiagnostic } from './notation/diagnostics.js' 

export type ScoreDiagnosticSeverity = 'none' | 'lyric' | 'error'

export function scoreDiagnosticSeverity(diagnostics: readonly ScoreDiagnostic[]): ScoreDiagnosticSeverity {
  if (diagnostics.length === 0) return 'none'
  return diagnostics.every((diagnostic) => diagnostic.severity === 'warning') ? 'lyric' : 'error'
}
