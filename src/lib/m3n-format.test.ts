import { describe, expect, it } from 'vitest'
import { formatM3N } from './m3n-format'
import { validateM3N } from './m3n-validate'

describe('formatM3N', () => {
  it('formats the current phrase structure without rewriting music atoms', () => {
    const source = '{title=Test Song}   {key=C}  {4/4}\nN:  1~  1  2  3  |  4  5  6  7  :||{x2}\nL1:  你 好  %  世 界\nL2:  Hello   world  again  now\n--- V1 , V2\nN:  [135:h]{arp}  0  0  0  |||\n'

    expect(formatM3N(source)).toBe([
      '{title=Test Song} {key=C} {4/4}',
      'N: 1~ 1 2 3 | 4 5 6 7 :||{x2}',
      'L1: 你好%世界',
      'L2: Hello world again now',
      '---V1,V2',
      'N: [135:h]{arp} 0 0^ |||',
      '',
    ].join('\n'))
  })

  it('merges a same-pitch tie only when it keeps its rhythmic boundary', () => {
    expect(formatM3N('{4/4}\nN: 1~ 1 2 3 |||')).toContain('N: 1^ 2 3 |||')
    expect(formatM3N('{4/4}\nN: 2 1~ 1 3 |||')).toContain('N: 2 1~ 1 3 |||')
  })

  it('preserves comments and directive values while normalizing surrounding whitespace', () => {
    const source = '{title=A  B}  {text=  dolce  } // heading\nN: {p}1{text=keep  spaces}  2  3  4  // phrase\n'

    expect(formatM3N(source)).toBe([
      '{title=A  B} {text=  dolce  }  // heading',
      'N: {p}1{text=keep  spaces} 2 3 4  // phrase',
      '',
    ].join('\n'))
  })

  it('is idempotent and retains strict lyric and house validation', () => {
    const source = '{key=C} {2/4}\n\nN: 1 2 |\n---V1\nN: 3 4 |\nL: 甲乙\n\n---V2\nN: 5 6 |||\nL: 丙丁\n'
    const formatted = formatM3N(source)

    expect(formatM3N(formatted)).toBe(formatted)
    expect(formatted).not.toContain('\n\n')
    expect(validateM3N(formatted)).toEqual([])
  })
})
