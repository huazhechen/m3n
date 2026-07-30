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

  it('validates pickup measures independently for each part', () => {
    const source = [
      '{parts=A B}',
      '{key=C} {4/4}',
      '{part=A} 1 | 1 2 3 4 | 2 3 4 ||| {/}',
      '{part=B} 5 | 1 2 3 4 | 6 7 1 ||| {/}',
    ].join('\n')

    expect(validateM3N(source)).toEqual([])
  })

  it('allows rests in tuplet groups regardless of whitespace', () => {
    expect(validateM3N('{key=C} {2/4}\n[066:2] |')).toEqual([])
    expect(validateM3N('{key=C} {2/4}\n[0 6 6:2] |')).toEqual([])
  })

  it('still rejects rests in harmony groups', () => {
    expect(validateM3N('{key=C} {4/4}\n[10:h] |').some((message) => message.includes('和声组内不允许休止符'))).toBe(true)
  })

  it('counts adjacent volta alternatives from the same beat position', () => {
    const source = '{key=C} {4/4}\n1 2 {volta=1}3 4{/} {volta=2}5 6{/} |'

    expect(validateM3N(source)).toEqual([])
  })
})
