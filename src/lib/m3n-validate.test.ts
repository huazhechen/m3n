import { describe, expect, it } from 'vitest'
import { validateM3N } from './m3n-validate'

describe('validateM3N', () => {
  it('accepts a complete four-beat measure', () => {
    expect(validateM3N('{key=C} {4/4}\n1 2 3 4 |||')).toEqual([])
  })

  it('reports invalid notes and unclosed structures', () => {
    const diagnostics = validateM3N('{key=H}\n(1 2 | 8')
    expect(diagnostics.some((message) => message.includes('调号格式非法'))).toBe(true)
    expect(diagnostics.some((message) => message.includes('括号'))).toBe(true)
    expect(diagnostics.some((message) => message.includes('无法识别'))).toBe(true)
  })
})
