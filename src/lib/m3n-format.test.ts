import { describe, expect, it } from 'vitest'
import { formatM3N } from './m3n-format'

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

  it('combines an ordinary repeat end and terminal bar', () => {
    const result = formatM3N('{4/4}\n1e^^ :|| |||')

    expect(result).toContain('1e^^ :|||')
  })
})
