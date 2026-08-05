import { describe, expect, it } from 'vitest'
import { validateM3NSyntaxTree } from './syntax-rules'
import { parseM3NSyntaxTree } from './syntax-tree'

describe('M3N directive rules', () => {
  it('reports mismatched closures at the directive span', () => {
    const source = 'N: {cresc}1 2{/lg} |||'
    expect(validateM3NSyntaxTree(parseM3NSyntaxTree(source))).toContainEqual(expect.objectContaining({
      code: 'M3N_DIRECTIVE_MISMATCHED_CLOSE',
      range: { start: source.indexOf('{/lg}'), end: source.indexOf('{/lg}') + 5 },
    }))
  })

  it('requires positive integer tempo targets', () => {
    const diagnostics = validateM3NSyntaxTree(parseM3NSyntaxTree('{4/4} {rit=0} 1 2 3 4 |||'))
    expect(diagnostics[0]?.code).toBe('M3N_DIRECTIVE_INVALID_TEMPO_TARGET')
  })
})
