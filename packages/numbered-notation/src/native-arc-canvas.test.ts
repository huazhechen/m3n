import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeArcGeometry } from './native-arc.js'
import { nativeSvgInk } from './native-ink.js'
import { nativeStyle } from './native-style.js'

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
    expect(arc.right-arc.left).toBeGreaterThanOrEqual(nativeStyle.music*.45*1.2-1e-6)
  })
})

it.each(['tie','slur'])('reserves leading space only on a row closing a cross-row %s', kind => {
  const source = kind === 'tie' ? '{2/4}\nN: 1 2~ | {br}2 3 | {br}4 5 |'
    : '{2/4}\nN: 1 {lg}2 | {br}3{/} 4 | {br}5 6 |'
  const layout = layoutNativeScore(parseM3NDocument(source),{width:540,pageMargin:0})
  expect(layout.systems[0]!.arcContinuationLeft).toBeUndefined()
  expect(layout.systems[1]!.arcContinuationLeft).toBe(0)
  expect(layout.systems[2]!.arcContinuationLeft).toBeUndefined()
  const relation = layout.relations.find(relation => relation.kind===kind)!
  const arc = nativeArcGeometry(relation,layout.systems[1]!)
  expect(arc.right-arc.left).toBeGreaterThanOrEqual(nativeStyle.music*.45*1.2-1e-6)
})
