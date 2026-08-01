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
})
