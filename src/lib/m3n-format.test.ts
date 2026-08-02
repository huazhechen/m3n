import { describe, expect, it } from 'vitest'
import { formatM3N } from './m3n-format'
import { validateM3N } from './m3n-validate'

describe('formatM3N', () => {
  it('groups mixed eighth and sixteenth notes into a nested beam', () => {
    const result = formatM3N('{key=C} {2/4}\n(0) ((5)) ((4#)) | 1 1 |||')

    expect(result).toContain('(0 (5 4#)) | 1 1 |||')
  })

  it('keeps semantic intervals unchanged while organizing spaces', () => {
    const result = formatM3N('{key=C} {2/4}\n {lg}(1)  (2){/} |  1  1 |||')

    expect(result).toContain('{lg}(1) (2){/} | 1 1 |||')
  })

  it('preserves the music following an inline comment', () => {
    const source = '{key=C} {2/4}\n// theme\n1 1 | 2 2 |||'
    const result = formatM3N(source)

    expect(result).toContain('// theme\n1 1 | 2 2 |||')
  })

  it('moves a D.S. marker before the repeat end it concludes, then combines a terminal bar', () => {
    const result = formatM3N('{4/4}\n1e^^ :|| {ds} |||')

    expect(result).toContain('1e^^ {ds}:|||')
  })

  it('moves a D.S. marker before a repeat end even without a terminal bar', () => {
    const result = formatM3N('{4/4}\n1e^^ :|| {ds}')

    expect(result).toContain('1e^^ {ds}:||')
  })

  it('moves fine before the preceding repeat bar before formatting following bars', () => {
    const result = formatM3N('{4/4}\n1e^^ :||: {fine} |||')

    expect(result).toContain('1e^^ {fine}:||: |||')
  })

  it('combines an ordinary repeat end and terminal bar', () => {
    const result = formatM3N('{4/4}\n1e^^ :|| |||')

    expect(result).toContain('1e^^ :|||')
  })

  it('allows a rest run from the beginning of a divisible meter to cross its midpoint', () => {
    const result = formatM3N('{4/4}\n0 0 0 0 | 1 2 3 4 |||')

    expect(result).toContain('0^^ | 1 2 3 4 |||')
  })

  it('allows a compound-meter rest run from the beginning to cross the midpoint', () => {
    const result = formatM3N('{6/8}\n(0 0 0) (0 0 0) |||')

    expect(result).toContain('0^. |||')
  })

  it('preserves rest runs that start before a midpoint or inside a beat', () => {
    const crossBeatGroup = formatM3N('{4/4}\n1 0 0 3 | 4 5 6 7 |||')
    const nestedRhythm = formatM3N('{3/4}\n1.(0) (0 1) | 2 3 4 |||')

    expect(crossBeatGroup).toContain('1 0 0 3 | 4 5 6 7 |||')
    expect(nestedRhythm).toContain('1.(0) (0 1) | 2 3 4 |||')
  })

  it('merges tied notes only when their duration respects the same boundary', () => {
    const fromStart = formatM3N('{4/4}\n1~ 1 2 3 |||')
    const acrossMidpoint = formatM3N('{4/4}\n2 1~ 1 3 |||')

    expect(fromStart).toContain('1^ 2 3 |||')
    expect(acrossMidpoint).toContain('2 1~ 1 3 |||')
  })

  it('splits a sustained note that crosses the midpoint of a divisible meter', () => {
    const result = formatM3N('{key=F} {4/4}\n(3) 6d^..~ | 6d^ (6d 7bd) (6d 3d) |||')

    expect(result).toContain('(3) 6d.~ 6d^~ | 6d^ (6d 7bd) (6d 3d) |||')
    expect(validateM3N(result)).toEqual([])
  })

  it('does not break nested rhythm parentheses while merging', () => {
    const result = formatM3N('{6/8}\n((0 0 0 0)) ((0 0 0 0)) ((0 0 0 0)) |||')

    expect(validateM3N(result)).toEqual([])
    expect(result).toContain('((0 0 0 0))')
  })

  it('removes only Chinese lyric spacing while normalizing legacy lyric blocks', () => {
    const result = formatM3N('{key=C} {2/4}\n1 2 |\n{lyrics}\n甲  % %  乙%%丙\n{/}\n{lyrics}\nhello  world\n{/}')

    expect(result).toContain('{lyrics}\n甲{%2}乙{%2}丙\n{/}')
    expect(result).toContain('{lyrics}\nhello world\n{/}')
  })

  it('preserves lyric line breaks, including blank lines between sections', () => {
    const result = formatM3N('{key=C} {2/4}\n1 2 |\n{lyrics}\n第一行  % %\n\n第二行\n{/}')

    expect(result).toContain('{lyrics}\n第一行{%2}\n\n第二行\n{/}')
  })
})
