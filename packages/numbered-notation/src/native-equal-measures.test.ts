// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { compileScore, ErrorDiagnostic } from '@m3n/jpfun'
import { parseM3NDocument } from '@m3n/notation'
import { projectNumberedScore } from './projection.js'
import { layoutNativeScore } from './native-layout.js'
import { nativeBarMetrics } from './native-horizontal.js'
import type { TextMeasurer } from './native-measure.js'

const measurer: TextMeasurer = {measureText(text, style) {
  return {w:[...text].length*style.fontSize*.58,h:style.fontSize,baseline:style.fontSize*.8}
}}
const cases = [
  ['mixed densities', '{4/4}\nN: (1 2 3 4 5 6 7 1e) | 2 3 4 5 | 1^^ |||'],
  ['shared repeat boundary', '{4/4}\nN: 1 2 3 4 | ||: 5 6 7 1e | 2 3 4 5 :||'],
  ['navigation before the final bar', '{4/4}\nN: 1 2 3 4 | 5 6 7 1e {fine} |||'],
  ['parallel bass', '{4/4}\nN: 1 2 3 4 | (5 6 7 1e 2e 3e 4e 5e) | 1^^ |||\nB: 1d^^ | 5d^^ | 1d^^ |||'],
  ['parentheses and lyrics', '{4/4}\nN: {inst}1 2 3 4 | (5 6 7 1e 2e 3e 4e 5e){/} | 1^^ |||\nL: 春风吹过山林间的花儿开了'],
] as const

describe('native equal-measure interior spacing', () => {
  it.each(cases)('matches time-column anchors with fixed measure boundaries: %s', (_name, source) => {
    const document = parseM3NDocument(`{equal-measures=true}\n${source}`)
    for (const spacing of [{}, {noteGapEm:1.2}, {noteGapEm:.6,minimumNoteGapEm:.3}]) {
      const options = {width:1200,paged:false,textMeasurer:measurer,...spacing}
      const native = layoutNativeScore(document,options)
      const projection = projectNumberedScore(document, options)
      const minimum = spacing.minimumNoteGapEm ?? (spacing.noteGapEm === undefined ? .3 : undefined)
      const reference = compileScore(projection.source, {
        textMeasurer:measurer,autoWrap:true,alignRelations:true,equalMeasures:true,
        minimumNoteGapFloor:minimum===undefined ? undefined : 22*Math.min(.1,minimum),
        noteGap:22*(spacing.noteGapEm??.5),minimumNoteGap:minimum===undefined ? undefined : 22*minimum,
      })
      expect(reference.diagnostics.filter(item => item instanceof ErrorDiagnostic)).toEqual([])
      let checked = 0
      for (const note of reference.layout.objects.filter(node => node.T.toNumber()>0)) {
        let ast: typeof note.ast | null = note.ast
        while (ast && !projection.bindings.has(ast.label ?? '')) ast=ast.parent
        const binding = ast && projection.bindings.get(ast.label!)
        if (!binding) continue
        const glyph = native.projection.glyphs.find(g => g.id===binding.visualId)!
        expect(glyph, binding.visualId).toBeDefined()
        expect(Math.abs(glyph.x-note.box.x-note.box.anchor),binding.visualId).toBeLessThan(.05)
        checked++
      }
      expect(checked).toBe(native.projection.glyphs.length)
    }
  })
  it('places the visible bar anchors at equal intervals with the complete final bar inside the margin', () => {
    const layout = layoutNativeScore(parseM3NDocument('{equal-measures=true}{4/4}\nN: 1 2 3 4 | (5 6 7 1e 2e 3e 4e 5e) | 1^^ |||'),{width:800,paged:false,textMeasurer:measurer})
    const bar = nativeBarMetrics('end'), right = bar.width-bar.anchor
    const cell = (800-64-right)/3
    const measures = layout.systems[0]!.measures
    expect(measures).toHaveLength(3)
    measures.forEach((measure,index) => expect(measure.barX).toBeCloseTo(32+(index+1)*cell,6))
    expect(measures.at(-1)!.barX!+right).toBeCloseTo(768,6)
  })
})
