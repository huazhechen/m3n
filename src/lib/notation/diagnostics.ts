export type DiagnosticSeverity = 'error' | 'warning'

export type DiagnosticRange = {
  start: number
  end: number
}

export type ScoreDiagnostic = {
  code: string
  severity: DiagnosticSeverity
  message: string
  range?: DiagnosticRange
  legacyMessage: string
}

function rangeForLine(source: string, line: number): DiagnosticRange | undefined {
  if (!Number.isSafeInteger(line) || line < 1) return undefined
  let start = 0
  for (let current = 1; current < line; current += 1) {
    const newline = source.indexOf('\n', start)
    if (newline === -1) return undefined
    start = newline + 1
  }
  const newline = source.indexOf('\n', start)
  return { start, end: newline === -1 ? source.length : newline }
}

/** Converts the established text protocol while consumers migrate to typed diagnostics. */
export function diagnosticFromLegacyMessage(source: string, legacyMessage: string, code = 'M3N_VALIDATION'): ScoreDiagnostic {
  const lyric = legacyMessage.startsWith('[L] ')
  const messageWithLocation = lyric ? legacyMessage.slice(4) : legacyMessage
  const located = /^第 (\d+) 行：(.*)$/u.exec(messageWithLocation)
  return {
    code: lyric ? 'M3N_LYRIC_ALIGNMENT' : code,
    severity: lyric ? 'warning' : 'error',
    message: located?.[2] ?? messageWithLocation,
    range: located ? rangeForLine(source, Number(located[1])) : undefined,
    legacyMessage,
  }
}

export function diagnosticsFromLegacyMessages(source: string, messages: readonly string[], code?: string): ScoreDiagnostic[] {
  return messages.map((message) => diagnosticFromLegacyMessage(source, message, code))
}

export function formatScoreDiagnostic(diagnostic: ScoreDiagnostic) {
  return diagnostic.legacyMessage
}
