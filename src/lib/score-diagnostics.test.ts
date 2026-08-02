import { describe, expect, it } from 'vitest'
import { scoreDiagnosticSeverity } from './score-diagnostics'

describe('scoreDiagnosticSeverity', () => {
  it('distinguishes lyric-only diagnostics from score errors', () => {
    expect(scoreDiagnosticSeverity([])).toBe('none')
    expect(scoreDiagnosticSeverity(['[L] 第 4 行：歌词对位数量不匹配'])).toBe('lyric')
    expect(scoreDiagnosticSeverity(['第 4 行：小节拍数超出'])).toBe('error')
    expect(scoreDiagnosticSeverity(['歌词对位数量不匹配', '小节拍数超出'])).toBe('error')
  })
})
