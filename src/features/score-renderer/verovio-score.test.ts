import { describe, expect, it } from 'vitest'
import { automaticSystemBreakMeasureIds, encodeSystemBreaks } from './verovio-score'

describe('VerovioScore layout', () => {
  it('collects the final measure of each automatically laid-out system', () => {
    const breaks = automaticSystemBreakMeasureIds([
      '<g class="system"><g id="m3n-measure-1-1"/><g id="m3n-measure-1-2"/></g><g class="system"><g id="m3n-measure-1-3"/></g>',
    ])

    expect(breaks).toEqual(new Set(['m3n-measure-1-2', 'm3n-measure-1-3']))
  })

  it('adds automatic system breaks without duplicating encoded breaks', () => {
    const mei = '<section><measure xml:id="m3n-measure-1-1"></measure><measure xml:id="m3n-measure-1-2"></measure><sb/><measure xml:id="m3n-measure-1-3"></measure></section>'

    expect(encodeSystemBreaks(mei, new Set(['m3n-measure-1-1', 'm3n-measure-1-2']))).toBe(
      '<section><measure xml:id="m3n-measure-1-1"></measure><sb/><measure xml:id="m3n-measure-1-2"></measure><sb/><measure xml:id="m3n-measure-1-3"></measure></section>',
    )
  })
})
