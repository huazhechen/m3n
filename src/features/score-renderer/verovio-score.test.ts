import { describe, expect, it } from 'vitest'
import { layoutBreaks, renderNormalLyricSpacing } from './verovio-score'

describe('VerovioScore layout', () => {
  it('keeps automatic line breaking enabled alongside encoded system breaks', () => {
    expect(layoutBreaks('<section><measure/><sb/><measure/></section>')).toBe('smart')
    expect(layoutBreaks('<section><measure/></section>')).toBe('auto')
  })

  it('keeps lyric layout reservations while restoring normal glyph spacing', () => {
    const svg = '<g class="syl"><text><tspan class="text"><tspan letter-spacing="180px">（苦的）</tspan></tspan></text></g><tspan letter-spacing="90px">not lyric</tspan>'
    expect(renderNormalLyricSpacing(svg)).toBe('<g class="syl"><text><tspan class="text"><tspan>（苦的）</tspan></tspan></text></g><tspan letter-spacing="90px">not lyric</tspan>')
  })
})
