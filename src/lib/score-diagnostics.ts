import type { ScoreDiagnostic } from './notation/diagnostics'

export type ScoreDiagnosticSeverity = 'none' | 'lyric' | 'error'

export function scoreDiagnosticSeverity(diagnostics: readonly (string | ScoreDiagnostic)[]): ScoreDiagnosticSeverity {
  if (diagnostics.length === 0) return 'none'
  return diagnostics.every((diagnostic) => (
    typeof diagnostic === 'string' ? diagnostic.startsWith('[L]') : diagnostic.code === 'M3N_LYRIC_ALIGNMENT'
  )) ? 'lyric' : 'error'
}
