import { describe, expect, it } from 'vitest'
import { layoutBreaks } from './verovio-score'

describe('VerovioScore layout', () => {
  it('keeps automatic line breaking enabled alongside encoded system breaks', () => {
    expect(layoutBreaks('<section><measure/><sb/><measure/></section>')).toBe('smart')
    expect(layoutBreaks('<section><measure/></section>')).toBe('auto')
  })
})
