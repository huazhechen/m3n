// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { scoreFontText } from './fonts.js'
import { layoutNativeScore } from './native-layout.js'
import { renderNativePages } from './native-svg.js'
import { DefaultTextMeasurer } from './native-measure.js'

const source = '{4/4}\nN: 1 2 3 4 | {interlude} | 5 6 7 1e |||'
describe('unmeasured interlude engraving', () => {
  it.each([320, 600, 800])('shows a multimeasure rest symbol without text, count or duration at width %s', width => {
    const document = parseM3NDocument(source)
    const layout = layoutNativeScore(document, { width, paged: false, textMeasurer: new DefaultTextMeasurer() })
    expect(layout.projection.measures.map(measure => measure.number)).toEqual([1, 1, 2])
    const marker = layout.projection.glyphs.find(glyph => glyph.interlude)!
    expect(marker.beats).toBe(0)
    expect(marker.event).toBeUndefined()
    const root = new DOMParser().parseFromString(renderNativePages(layout).join(''), 'text/html')
    const rendered = root.querySelector('[data-m3n-role="interlude"]')!
    expect(rendered.textContent).toBe('')
    expect(rendered.querySelector('text')).toBeNull()
    expect(rendered.querySelectorAll('line')).toHaveLength(3)
    expect(rendered.querySelector('[stroke-dasharray]')).toBeNull()
    expect(rendered.querySelector('[data-m3n-role="multi-rest"]')).toBeNull()
    expect(scoreFontText(document)).not.toContain('间奏')
    expect(scoreFontText(source)).not.toContain('间奏')
  })
})
