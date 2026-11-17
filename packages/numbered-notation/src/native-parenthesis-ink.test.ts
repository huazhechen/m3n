import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import type { TextMeasurer } from './native-measure.js'

const measurer = (overhang: boolean): TextMeasurer => ({ measureText(text, style) {
  const w = [...text].length * style.fontSize * .58
  return { w, h: style.fontSize, baseline: style.fontSize * .8,
    inkLeft: overhang && text === '(' ? -3 : 0,
    inkRight: w + (overhang && text === ')' ? 4 : 0) }
} })

describe('parenthesis ink beyond the text advance', () => {
  it('includes both overhangs in natural and minimum measure width', () => {
    const document = parseM3NDocument('{4/4}\nN: {inst}1 2 3 4{/} |||')
    const layouts = [false, true].map(overhang => layoutNativeScore(document, {
      width: 800, paged: false, pageMargin: 0, textMeasurer: measurer(overhang),
    }))
    const [before, after] = layouts.map(layout => layout.projection.measures[0]!)
    expect(after!.natural - before!.natural).toBeCloseTo(7, 6)
    expect(after!.minimum - before!.minimum).toBeCloseTo(7, 6)
  })

  it.each(['instrumental', 'alternative'].flatMap(kind => [false, true].flatMap(equalMeasures => [false, true].flatMap(paged =>
    [320, 800].map(width => ({ kind, equalMeasures, paged, width }))))))(
    'keeps actual ink inside each zero-margin system: %j', options => {
      const notes = Array(12).fill('1 2 3 4 |').join(' ')
      const document = parseM3NDocument(options.kind === 'instrumental'
        ? `{4/4}\nN: {inst}${notes}1 2 3 4{/} |||`
        : `{4/4}\nN: ||: ${notes}1 2 3 4 :||\nNs[2]: 1: ${notes}1 2 3 4 |`)
      const layout = layoutNativeScore(document, { ...options, pageMargin: 0, textMeasurer: measurer(true) })
      expect(layout.systems.length).toBeGreaterThan(1)
      for (const system of layout.systems) {
        const brackets = [...system.relationLayout!].filter(([relation]) => relation.kind === 'inst')
        expect(brackets.length).toBeGreaterThan(0)
        for (const [, { ink } ] of brackets) {
          expect(ink.left).toBeGreaterThanOrEqual(-1e-6)
          expect(ink.right).toBeLessThanOrEqual(options.width + 1e-6)
        }
      }
    })
})
