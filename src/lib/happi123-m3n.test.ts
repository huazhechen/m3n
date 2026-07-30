import { describe, expect, it } from 'vitest'
import { happi123ToM3N } from './happi123-m3n'

describe('happi123ToM3N', () => {
  it('converts metadata, notes, and lyrics', () => {
    const source = [
      '{title:快乐颂}',
      '{key_signature:1=#F4}',
      '{time_signature:3/4}',
      '{bpm:90}',
      '1 2_ 3- | 4 5 6 |||',
      '{lyric}欢 乐 颂{/lyric}',
    ].join('\n')
    const result = happi123ToM3N(source)

    expect(result.diagnostics).toEqual([])
    expect(result.output).toContain('{title=快乐颂}')
    expect(result.output).toContain('{key=F#} {3/4} {tempo=90bpm}')
    expect(result.output).toContain('1 (2) 3^')
    expect(result.output).toContain('{lyrics}\n欢 乐 颂\n{/}')
  })

  it('diagnoses lossy tuplets instead of silently discarding them', () => {
    const result = happi123ToM3N('(3: 1_ 2 3)')
    expect(result.diagnostics.some((message) => message.includes('三连音'))).toBe(true)
  })
})
