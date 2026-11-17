import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout'
import { nativeTiePortTop } from './native-note-metrics.js'

describe('relation and ending clearance', () => {
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
    expect(top(high) - top(plain)).toBeCloseTo(22 * (0.23 + 0.05), 3)
    expect(top(higher) - top(high)).toBeCloseTo(22 * 0.23, 3)
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

  it.each(['tr', 'fermata', 'f2', 'p'])('retains the exposed octave-dot gap beneath outer %s', mark => {
    const head = mark === 'p' ? '{p}1e' : `1e{${mark}}`
    const layout = layoutNativeScore(parseM3NDocument(`{2/4}\nN: {lg}${head} 2e{/} |||`), { width: 800, paged: false })
    const glyph = layout.relations.find(value => value.kind === 'slur')!.first
    expect(nativeTiePortTop(glyph) - glyph.tieTop!).toBeCloseTo(22 * 0.05, 5)
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
    expect(endingTop(inside)).toBeGreaterThan(endingTop(plain) + 10)
  })
})
