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
  messageArgs?: Readonly<Record<string, string | number>>
}

export function createScoreDiagnostic(input: {
  code: string
  message: string
  range?: DiagnosticRange
  severity?: DiagnosticSeverity
  messageArgs?: Readonly<Record<string, string | number>>
}): ScoreDiagnostic {
  return {
    code: input.code,
    severity: input.severity ?? 'error',
    message: input.message,
    range: input.range,
    messageArgs: input.messageArgs,
  }
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
  return diagnostic.message
}
