import { describe, expect, it } from 'vitest'
import { analyzeM3N, formatM3N, parseM3NDocument } from './index.js'

describe('explicit expression directions', () => {
  it('preserves independent expression and instruction fields through formatting', () => {
    const source = '{4/4}\nN: {text=快速吹吸切换}{expression=Largo}1 2 {expression=dolce}3 4 |||'
    for (const value of [source, formatM3N(source)]) {
      expect(analyzeM3N(value).diagnostics).toEqual([])
      const events = parseM3NDocument(value).parts.get('score')!.melody[0]!.events
      expect(events[0]).toMatchObject({ text: '快速吹吸切换', expression: 'Largo' })
      expect(events[2]).toMatchObject({ expression: 'dolce' })
      expect(events[2]!.text).toBeUndefined()
      expect(events[3]!.expression).toBeUndefined()
    }
  })

  it('rejects an empty expression', () => {
    expect(analyzeM3N('{4/4}\nN: {expression=}1 2 3 4 |||').diagnostics.some(d => d.severity === 'error' && d.message.includes('expression'))).toBe(true)
  })
})
