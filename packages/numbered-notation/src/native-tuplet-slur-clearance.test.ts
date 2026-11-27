import { readFileSync } from 'node:fs'
import { parseM3NDocument } from '@m3n/notation'
import { expect, it } from 'vitest'
import { layoutNativeScore } from './native-layout.js'
import { nativeRibbonRange } from './native-curve.js'
import { nativeSvgPieces } from './native-ink.js'
import { nativeCoreGap } from './native-style.js'

it.each([528,600,768].flatMap(width => [false,true].map(numericLayout => ({width,numericLayout}))))(
  'packs 小夜曲 slurs around individual tuplet pieces at $width, numeric=$numericLayout', ({width,numericLayout}) => {
    const source = readFileSync(new URL('../../../src/scores/xiao_ye_qu_01.m3n',import.meta.url),'utf8')
    const layout = layoutNativeScore(parseM3NDocument(source),{width,numericLayout,paged:true})
    let checked=0
    for (const system of layout.systems) for (const [relation, placed] of system.relationLayout ?? []) {
      if (relation.kind !== 'slur' || !placed.arc) continue
      const tuplet = [...system.relationLayout ?? []].find(([peer]) => peer.kind === 'tuplet'
        && peer.first === relation.first && peer.last === relation.last)
      if (!tuplet) continue
      const pieces = tuplet[1].pieces ?? nativeSvgPieces(tuplet[1].svg,layout.measurer)
      let minimum=Infinity
      for (const piece of pieces) {
        const edge=nativeRibbonRange(placed.arc,piece.left,piece.right)
        if (edge) minimum=Math.min(minimum,piece.top-edge.bottom)
      }
      const expected=(system.coreGap ?? nativeCoreGap())*.12
      expect(minimum).toBeGreaterThanOrEqual(expected - .005)
      // Tight placement must also be achieved; collision-only assertions
      // would let the old whole-tuplet rectangle's excess lift pass.
      expect(minimum).toBeCloseTo(expected,2)
      checked++
    }
    expect(checked).toBeGreaterThan(5)
  })
