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
  messageArgs?: Readonly<Record<string, string | number>>
}

export function createScoreDiagnostic(input: {
  code: string
  message: string
  range?: DiagnosticRange
  severity?: DiagnosticSeverity
  legacyMessage?: string
  messageArgs?: Readonly<Record<string, string | number>>
}): ScoreDiagnostic {
  return {
    code: input.code,
    severity: input.severity ?? 'error',
    message: input.message,
    range: input.range,
    legacyMessage: input.legacyMessage ?? input.message,
    messageArgs: input.messageArgs,
  }
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
    code: code ?? (lyric ? 'M3N_LYRIC_ALIGNMENT' : 'M3N_VALIDATION'),
    severity: lyric ? 'warning' : 'error',
    message: located?.[2] ?? messageWithLocation,
    range: located ? rangeForLine(source, Number(located[1])) : undefined,
    legacyMessage,
  }
}

export function diagnosticsFromLegacyMessages(source: string, messages: readonly string[], code?: string): ScoreDiagnostic[] {
  return messages.map((message) => diagnosticFromLegacyMessage(source, message, code))
}

const localizedMessages: Partial<Record<string, (args: Readonly<Record<string, string | number>>) => string>> = {
  M3N_BASS_MEASURE_COUNT: (args) => `双谱表小节数量不一致：正文 ${args.melodyMeasures} 小节，低音 ${args.bassMeasures} 小节`,
  M3N_BASS_DURATION_MISMATCH: (args) => `双谱表第 ${args.measure} 小节时值不一致：正文 ${args.melodyBeats} 拍，低音 ${args.bassBeats} 拍`,
  M3N_METER_OVERFULL: (args) => `${args.line ? `第 ${args.line} 行，` : ''}第 ${args.measure} 小节拍数超出：期望 ${args.expected} 拍，实际 ${args.actual} 拍`,
  M3N_METER_INCOMPLETE_SINGLE: (args) => `${args.line ? `第 ${args.line} 行，` : ''}第 ${args.measure} 小节：单个小节拍数必须满拍：期望 ${args.expected} 拍，实际 ${args.actual} 拍`,
  M3N_METER_INCOMPLETE_MIDDLE: (args) => `${args.line ? `第 ${args.line} 行，` : ''}第 ${args.measure} 小节：中间小节拍数不合规：期望 ${args.expected} 拍，实际 ${args.actual} 拍`,
  M3N_METER_INCOMPLETE_FINAL: (args) => `${args.line ? `第 ${args.line} 行，` : ''}第 ${args.measure} 小节：没有弱起时末小节拍数必须满拍：期望 ${args.expected} 拍，实际 ${args.actual} 拍`,
  M3N_METER_PICKUP_MISMATCH: (args) => `首末小节拍数不互补：首 ${args.first} 拍 + 末 ${args.last} 拍，完整小节为 ${args.expected} 拍`,
}

export function formatScoreDiagnostic(diagnostic: ScoreDiagnostic) {
  const formatter = localizedMessages[diagnostic.code]
  if (formatter && diagnostic.messageArgs) return formatter(diagnostic.messageArgs)
  return diagnostic.legacyMessage
}
