import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { placeNativeBarLabels } from './native-system-labels.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativeMeasureBarPositions } from './native-bars.js'
import { nativeSvgInk } from './native-ink.js'

const measurer = new DefaultTextMeasurer()

describe('bar labels with small page margins', () => {
  it.each([false, true].flatMap(paged => [0, 22 * .2].map(pageMargin => ({ paged, pageMargin }))))('keeps multi-digit measure numbers and repeat counts in the canvas: $paged/$pageMargin', ({ paged, pageMargin }) => {
    const width = 320
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1 2 3 4 |'), { width, paged, pageMargin, textMeasurer: measurer })
    const system = score.systems[0]!
    system.measures[0]!.number = 1234
    system.measures[0]!.source.repeatCount = 123
    system.decorationLayout = []
    placeNativeBarLabels(system, [], measurer, true, width)
    const number = system.decorationLayout!.find(label => label.svg.includes('measure-number'))!
    const closing = nativeMeasureBarPositions(system.measures, 0).at(-1)!
    expect(nativeSvgInk(number.svg, measurer).right).toBeCloseTo(closing.x, 4)
    const labels = system.decorationLayout!
    expect(labels).toHaveLength(2)
    for (const label of labels) {
      const ink = nativeSvgInk(label.svg, measurer)
      expect(ink.left).toBeGreaterThanOrEqual(-.0001)
      expect(ink.right).toBeLessThanOrEqual(width + .0001)
    }
  })
})
