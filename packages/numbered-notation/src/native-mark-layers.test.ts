import { SCORE_TEXT_FONT } from './font-family.js'
// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeRibbonRange } from './native-curve.js'
import { nativeCoreGap } from './native-style.js'
import { DefaultTextMeasurer } from './native-measure.js'

it.each(['fermata', 'tr', 'prall', 'f1', 'f5', 'breath'])('keeps %s with its host inside arcs and hairpins, including wrapped continuations', name => {
  for (const width of [320, 800]) for (const paged of [false, true]) {
    const document = parseM3NDocument(`{4/4}\nN: {lg}{cresc}{p}1{${name}} 2{${name}}~ 2 4 | {br} 5 6{${name}} 7 1e{${name}}{/}{/} |||`)
    const layout = layoutNativeScore(document, { width, paged, minimumNoteGap: 9 })
    expect(layout.systems.length).toBeGreaterThanOrEqual(2)
    let checked = 0
    for (const system of layout.systems) {
      const relations = [...system.relationLayout!]
      const hairpin = relations.find(([relation]) => relation.kind === 'cresc')![1]
      for (const glyph of system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs))) {
        for (const mark of glyph.markLayout ?? []) {
          if (mark.name !== name) continue
          expect(mark.x ?? 0).toBe(0)
          expect(glyph.tieTop).toBeGreaterThanOrEqual(-mark.top - 0.001)
          for (const [, placed] of relations) {
            if (!placed.arc) continue
            const range = nativeRibbonRange(placed.arc, glyph.x + mark.left, glyph.x + mark.right)
            if (range) expect(range.bottom).toBeLessThanOrEqual(mark.top + 0.001)
          }
          expect(hairpin.ink.bottom).toBeLessThan(mark.top)
          checked++
        }
        const dynamic = glyph.markLayout?.find(mark => mark.name === 'p')
        if (dynamic) expect(dynamic.top + dynamic.height).toBeLessThanOrEqual(hairpin.ink.top - (nativeCoreGap() * .1) + 0.001)
      }
      for (const [, placed] of relations) if (placed.arc) {
        expect(hairpin.ink.bottom).toBeLessThan(placed.ink.top)
      }
    }
    expect(checked).toBe(4)
  }
})

it('reserves a wide local fingering at the line edge and before its next note', () => {
  const fallback = new DefaultTextMeasurer()
  const layout = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1{f2} 2 3 4 |||'), {
    width: 320, paged: false, minimumNoteGap: 9,
    textMeasurer: { measureText(text, style) {
      const metrics = fallback.measureText(text, style)
      return text === '2' && style.fontFamily === SCORE_TEXT_FONT ? { ...metrics, w: 140 } : metrics
    } },
  })
  const [first, next] = layout.projection.glyphs
  const mark = first!.markLayout!.find(mark => mark.name === 'f2')!
  expect(first!.x + mark.left).toBeGreaterThanOrEqual(-0.001)
  expect(first!.x + mark.right).toBeLessThanOrEqual(320.001)
  expect(next!.x - next!.inkLeft!).toBeGreaterThan(first!.x + mark.right)
})
