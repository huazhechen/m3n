import { parseM3NDocument } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import { layoutNativeScore } from './native-layout.js'
import type { TextMeasurer } from './native-measure.js'

const measurer = (overhang: boolean): TextMeasurer => ({ measureText(text, style) {
  const w = [...text].length * style.fontSize * .58
  return { w, h: style.fontSize, baseline: style.fontSize * .8,
    inkLeft: overhang && text === '(' ? -3 : 0,
    inkRight: w + (overhang && text === ')' ? 4 : 0) }
} })

describe('parenthesis ink beyond the text advance', () => {
  it('includes both overhangs in minimum measure width', () => {
    const document = parseM3NDocument('{4/4}\nN: {inst}1 2 3 4{/} |||')
    const layouts = [false, true].map(overhang => layoutNativeScore(document, {
      width: 800, paged: false, pageMargin: 0, textMeasurer: measurer(overhang),
    }))
    const [before, after] = layouts.map(layout => layout.projection.measures[0]!)
    expect(after!.minimum - before!.minimum).toBeCloseTo(7, 6)
  })
})
