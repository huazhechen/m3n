import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { nativeArcGeometry } from './native-arc.js'
import { layoutNativeScore } from './native-layout.js'
import type { TextMeasurer } from './native-measure.js'

describe('cross-system arc entry alignment', () => {
  it.each([1, 3])('keeps continuations at the music margin with %ipx glyph bearings', bearing => {
    const measurer: TextMeasurer = { measureText(text, style) {
      const advance = text.length * style.fontSize * .6
      return { w: advance, advance, h: style.fontSize * .75, baseline: style.fontSize * .75,
        inkLeft: bearing, inkRight: advance - bearing }
    } }
    const layout = layoutNativeScore(parseM3NDocument(
      '{2/4}\nN: {lg}1 2~ | {br}2 3 | {br}4 5{/} |||',
    ), { width: 800, paged: false, pageMargin: 40, textMeasurer: measurer })
    const slur = layout.relations.find(relation => relation.kind === 'slur')!
    expect(layout.systems).toHaveLength(3)
    for (const system of layout.systems.slice(1)) {
      const first = system.measures[0]!.columns[0]!.glyphs[0]!
      expect(first.x - first.inkLeft!).toBeGreaterThan(layout.margin)
      const arc = nativeArcGeometry(slur, system)
      expect(arc.left).toBeCloseTo(layout.margin, 8)
      // A closing curve still meets the last note at its original center;
      // the middle continuation reaches the full line's right boundary.
      expect(arc.right).toBeCloseTo(system === layout.systems.at(-1)
        ? slur.last.x : layout.options.width - layout.margin, 8)
    }
  })
})
