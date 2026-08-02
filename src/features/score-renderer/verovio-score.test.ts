import { describe, expect, it } from 'vitest'
import { layoutBreaks } from './verovio-score'

describe('VerovioScore layout', () => {
  it('uses encoded breaks when a score contains explicit system breaks', () => {
    expect(layoutBreaks('<section><measure/><sb/><measure/></section>')).toBe('encoded')
    expect(layoutBreaks('<section><measure/></section>')).toBe('auto')
  })
})
