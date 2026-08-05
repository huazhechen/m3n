import { describe, expect, it } from 'vitest'
import { scoreDiagnosticSeverity } from './score-diagnostics'

describe('scoreDiagnosticSeverity', () => {
  it('distinguishes lyric-only diagnostics from score errors', () => {
    expect(scoreDiagnosticSeverity([])).toBe('none')
    expect(scoreDiagnosticSeverity([{ code: 'L', severity: 'warning', message: '歌词对位数量不匹配' }])).toBe('lyric')
    expect(scoreDiagnosticSeverity([{ code: 'M', severity: 'error', message: '小节拍数超出' }])).toBe('error')
    expect(scoreDiagnosticSeverity([
      { code: 'L', severity: 'warning', message: '歌词对位数量不匹配' },
      { code: 'M', severity: 'error', message: '小节拍数超出' },
    ])).toBe('error')
  })
})
