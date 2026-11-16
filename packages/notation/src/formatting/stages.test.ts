import { describe, expect, it } from 'vitest'
import { normalizeGroups } from './groups.js'
import { normalizeLayout } from './layout.js'
import { alignLyrics } from './lyrics.js'
import { mapLiteralSafe } from './text.js'

describe('independent formatter stages', () => {
  it('simplifies spelling without merging separate tied events', () => {
    expect(normalizeGroups('{2/4}\nN: (1^~) 1 |||')).toBe('{2/4}\nN: 1~ 1 |||')
  })

  it('formats layout without changing note spelling', () => {
    expect(normalizeLayout('{2/4}\nN:  {br}(1^)   2 |||')).toBe('{2/4}\nN: {br}(1^) 2 |||\n')
  })

  it('aligns lyrics without normalizing music', () => {
    expect(alignLyrics('{2/4}\nN:  1 2 | 3 4 |||\nL: Hello world sing now\n'))
      .toBe('{2/4}\nN:  1 2 | 3 4 |||\nL: Hello world | sing now\n')
  })

  it('protects literal values, grouped lyrics and comments', () => {
    expect(mapLiteralSafe('{text=a | |}1 | | // | | {br}', text => text.replaceAll('|', '!')))
      .toBe('{text=a | |}1 ! !  // | | {br}')
    expect(mapLiteralSafe('(a | b) % %', text => text.replaceAll('|', '!'), true)).toBe('(a | b) % %')
  })
})
