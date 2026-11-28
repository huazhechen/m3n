import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout'
import { nativeTiePortTop } from './native-note-metrics.js'
import { nativeSvgPieces } from './native-ink.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativeArcSlice } from './native-curve.js'

describe('relation and ending clearance', () => {
  it.each([
    '{lg}1 {cresc}2 3{/} 4{/}',
    '{lg}1 {decres}2 3{/} 4{/}',
    '{cresc}1 {lg}2 3{/} 4{/}',
    '{cresc}{lg}1 2 3 4{/}{/}',
    '{lg}{cresc}1 2 3 4{/}{/}',
  ])('keeps expression hairpins outside slurs independently of span and declaration order: %s', notes => {
    const layout = layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${notes} |||`), { width: 800, paged: false })
    const slur = layout.relations.find(relation => relation.kind === 'slur')!
    const hairpin = layout.relations.find(relation => relation.kind === 'cresc' || relation.kind === 'decres')!
    expect(hairpin.level).toBeGreaterThan(slur.level)
    const system = layout.systems[0]!
    const arc = system.relationLayout!.get(slur)!.arc!
    const ink = system.relationLayout!.get(hairpin)!.ink
    const overlap = nativeArcSlice(arc.commands, Math.max(arc.left, Math.min(arc.right, (ink.left + ink.right) / 2)))!
    expect(ink.bottom).toBeLessThan(overlap.top)
  })

  it('keeps adjacent ties at the same height when they only share an endpoint', () => {
    const layout = layoutNativeScore(parseM3NDocument('{4/4}\nN: (1~ 1~ 1) 2 |||'), { width: 800, paged: false })
    const ties = layout.relations.filter(relation => relation.kind === 'tie')
    expect(ties).toHaveLength(2)
    expect(ties[0]!.last).toBe(ties[1]!.first)
    expect(ties.map(relation => relation.level)).toEqual([0, 0])
  })

  it('continues to separate genuinely nested slurs and ties', () => {
    const layout = layoutNativeScore(parseM3NDocument('{4/4}\nN: {lg}2 1~ 1^{hold}{/} 2 |||'), { width: 800, paged: false })
    const tie = layout.relations.find(relation => relation.kind === 'tie')!
    const slur = layout.relations.find(relation => relation.kind === 'slur')!
    expect(slur.level).toBeGreaterThan(tie.level)
  })

  it('leaves clearance above octave dots at arc endpoints without affecting bare notes', () => {
    const layout = (notes: string) => layoutNativeScore(parseM3NDocument(`{2/4}\nN: {lg}${notes}{/} |||`), { width: 800, paged: false })
    const plain = layout('1 2'), high = layout('1e 2e'), higher = layout('1ee 2ee')
    const top = (value: typeof plain) => value.systems[0]!.lanes[0]!.top
    expect(top(high) - top(plain)).toBeCloseTo(24 * (0.23 + 0.05), 3)
    expect(top(higher) - top(high)).toBeCloseTo(24 * 0.23, 3)
  })

  it.each(['tip', 'brk', 'hold', 'str'])('connects to %s above high notes without repeating the octave-dot gap', mark => {
    for (const head of ['1e', '[1e3e5e:h]']) {
      const layout = layoutNativeScore(parseM3NDocument(`{2/4}\nN: {lg}${head}{${mark}} ${head}{${mark}}{/} |||`), { width: 800, paged: false })
      const relation = layout.relations.find(value => value.kind === 'slur')!
      for (const glyph of [relation.first, relation.last]) {
        expect(glyph.markLayout?.find(value => value.name === mark)).toBeDefined()
        expect(nativeTiePortTop(glyph)).toBeCloseTo(glyph.tieTop!, 5)
      }
    }
  })

  it.each(['p', 'mf', 'sfz'])('retains the exposed octave-dot gap beneath outer %s', mark => {
    const head = `{${mark}}1e`
    const layout = layoutNativeScore(parseM3NDocument(`{2/4}\nN: {lg}${head} 2e{/} |||`), { width: 800, paged: false })
    const glyph = layout.relations.find(value => value.kind === 'slur')!.first
    expect(nativeTiePortTop(glyph) - glyph.tieTop!).toBeCloseTo(24 * 0.05, 5)
  })

  it.each(['[1e35:h]', '[1ee3d5:h]', '[13e5d:h]'])('does not apply an internal chord member’s octave-dot gap to %s', head => {
    const layout = layoutNativeScore(parseM3NDocument(`{2/4}\nN: {lg}${head} ${head}{/} |||`), { width: 800, paged: false })
    const glyph = layout.relations.find(value => value.kind === 'slur')!.first
    expect(nativeTiePortTop(glyph)).toBeCloseTo(glyph.tieTop!, 5)
  })

  it.each([false, true])('raises an ending only for decorations in its own range, paged=%s', paged => {
    const layout = (before: string, ending: string) => layoutNativeScore(parseM3NDocument(
      `{2/4}\nN: ${before} |\n---V1\nN: ${ending} :||\n---V2\nN: 5 6 |||`,
    ), { width: 1000, paged })
    const plain = layout('1 2', '3 4')
    const outside = layout('{lg}1ee 2ee{/}', '3 4')
    const inside = layout('1 2', '{lg}3ee 4ee{/}')
    expect(plain.systems).toHaveLength(1)
    expect(outside.systems).toHaveLength(1)
    expect(inside.systems).toHaveLength(1)
    // The unrelated arc may itself set the system's top. Compare the ending's
    // cached position relative to the music baseline, rather than page height.
    const endingTop = (value: typeof plain) => value.systems[0]!.voltas![0]!.top
    expect(endingTop(outside)).toBeCloseTo(endingTop(plain), 3)
    expect(endingTop(inside)).toBeGreaterThan(endingTop(plain))
    const system = inside.systems[0]!
    const arc = [...system.relationLayout!.values()].find(relation => relation.arc)!.arc!
    let intersections = 0
    for (const mark of nativeSvgPieces(system.voltas![0]!.svg, new DefaultTextMeasurer())) {
      const left = Math.max(mark.left, arc.left), right = Math.min(mark.right, arc.right)
      if (left > right) continue
      for (let i = 0; i <= 100; i++) {
        const edge = nativeArcSlice(arc.commands, left + (right - left) * i / 100)!
        expect(edge.top - mark.bottom).toBeGreaterThanOrEqual(2 - .0001)
        intersections++
      }
    }
    expect(intersections).toBeGreaterThan(0)
  })
})
