import { describe, expect, it } from 'vitest'
import { layoutBreaks } from './verovio-score'

describe('VerovioScore layout', () => {
  it('combines automatic layout with encoded system breaks', () => {
    expect(layoutBreaks()).toBe('line')
  })
})
