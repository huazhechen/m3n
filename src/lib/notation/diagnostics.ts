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

export function createScoreDiagnostic(input: {
  code: string
  message: string
  range?: DiagnosticRange
  severity?: DiagnosticSeverity
  legacyMessage?: string
}): ScoreDiagnostic {
  return {
    code: input.code,
    severity: input.severity ?? 'error',
    message: input.message,
    range: input.range,
    legacyMessage: input.legacyMessage ?? input.message,
  }
}

function diagnosticCode(message: string, lyric: boolean) {
  if (lyric) return 'M3N_LYRIC_ALIGNMENT'
  if (/无法识别的语法|格式非法|多余的|缺少/.test(message)) return 'M3N_SYNTAX'
  if (/和弦|和声/.test(message)) return 'M3N_HARMONY'
  if (/延音|连音/.test(message)) return 'M3N_TIE'
  if (/小节|拍号|拍，|拍$/.test(message)) return 'M3N_METER'
  if (/乐句|乐段|正文|终止线|N:|B:|C:|L:/.test(message)) return 'M3N_STRUCTURE'
  if (/音高|音符|元素序列/.test(message)) return 'M3N_PITCH'
  return 'M3N_VALIDATION'
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
export function diagnosticFromLegacyMessage(source: string, legacyMessage: string, code?: string): ScoreDiagnostic {
  const lyric = legacyMessage.startsWith('[L] ')
  const messageWithLocation = lyric ? legacyMessage.slice(4) : legacyMessage
  const located = /^第 (\d+) 行：(.*)$/u.exec(messageWithLocation)
  return {
    code: code ?? diagnosticCode(messageWithLocation, lyric),
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
