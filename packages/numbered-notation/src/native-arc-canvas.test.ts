import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeArcGeometry } from './native-arc.js'
import { nativeSvgInk } from './native-ink.js'

describe('arc continuations at a zero page margin', () => {
  it.each([false, true].flatMap(paged => [320, 540, 720].map(width => ({ paged, width }))))('keeps a tie ending on the first note within the canvas at $width, paged=$paged', ({ width, paged }) => {
    const score = layoutNativeScore(parseM3NDocument('{2/4}\nN: 1 2~ | {br}2 3 |'), { width, paged, pageMargin: 0 })
    const relation = score.relations.find(relation => relation.kind === 'tie')!
    const system = score.systems[1]!
    const placed = system.relationLayout!.get(relation)!
    const ink = nativeSvgInk(placed.svg, score.measurer)
    expect(ink.left).toBeGreaterThanOrEqual(-1e-6)
    expect(ink.right).toBeLessThanOrEqual(width)
    const arc = nativeArcGeometry(relation, system)
    expect(arc.left).toBeCloseTo(0, 8)
    expect(arc.right).toBeCloseTo(relation.last.x, 8)
  })
})
