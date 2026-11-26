import { describe, expect, it } from 'vitest' 
import { createScoreDiagnostic, formatScoreDiagnostic } from './diagnostics.js'

describe('diagnostic localization', () => {
  it('formats native diagnostics from stable codes and arguments', () => {
    const diagnostic = createScoreDiagnostic({
      code: 'M3N_BASS_MEASURE_COUNT',
      message: 'internal fallback',
      messageArgs: { melodyMeasures: 3, bassMeasures: 2 },
    })
    expect(formatScoreDiagnostic(diagnostic)).toBe('双谱表小节数量不一致：正文 3 小节，低音 2 小节')
  })

  it('preserves the supplied message for a general validation diagnostic', () => {
    const diagnostic = createScoreDiagnostic({ code: 'M3N_VALIDATION', message: '第 2 行：校验错误' })
    expect(formatScoreDiagnostic(diagnostic)).toBe('第 2 行：校验错误')
  })
})
