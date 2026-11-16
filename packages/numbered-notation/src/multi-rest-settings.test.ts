// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { compileScore, ErrorDiagnostic } from '@m3n/jpfun'
import { parseM3NDocument } from '@m3n/notation'
import { projectNumberedScore } from './projection.js'
import { layoutNativeScore } from './native-layout.js'
import { renderNativePages } from './native-svg.js'

const source = '{4/4}{120qpm}\nN: 1 2 3 4 | {segno}{key=G}{6/8}{60qpm}{rest=2} | 1 2 3 |||\nB: 1d^ 5d^ | {rest=2} | 1d 2d 3d |'
const variants = [320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged })))

describe('multi-rest onset controls in both renderers', () => {
  it.each(variants)('preserves onset settings and duration at width $width, paged=$paged', options => {
    const document = parseM3NDocument(source)
    const projection = projectNumberedScore(document, options)
    const result = compileScore(projection.source, { alignRelations: true, autoWrap: true })
    expect(result.diagnostics.filter(d => d instanceof ErrorDiagnostic)).toEqual([])
    const rests = result.lowering.columns.flat().filter(node => node.ast && 'callName' in node.ast && node.ast.callName === 'rest')
    expect(rests).toHaveLength(2)
    for (const rest of rests) {
      expect(rest.t.toNumber()).toBe(4)
      expect(rest.T.toNumber()).toBe(6)
    }
    expect(result.lowering.duration.toNumber()).toBe(13)
    // The state change must precede each rest, not the next audible event.
    expect(projection.source.match(/@meter\(6,8,size=18px\)\s+@tempo\(60,[^)]*\)\s+@rest\(2\)/g)).toHaveLength(2)
    expect(projection.source.match(/@meter\(6,8/g)).toHaveLength(2)
    const native = layoutNativeScore(document, options)
    const nativeRests = native.projection.glyphs.filter(g => g.multiRest)
    expect(nativeRests).toHaveLength(2)
    for (const rest of nativeRests) {
      expect(rest.beats).toBe(6)
      expect(rest.controls.filter(c => c.kind !== 'segno').map(c => [c.kind, c.text])).toEqual([
        ['key', '1=G'], ['meter', '6/8'], ['tempo', '♪ = 120'],
      ])
    }
    for (const glyph of native.projection.glyphs.filter(g => g.measureId === 'm3n-measure-1-3')) {
      expect(glyph.controls.filter(c => ['key', 'meter', 'tempo'].includes(c.kind))).toEqual([])
    }
    const root = new DOMParser().parseFromString(renderNativePages(native).join(''), 'text/html')
    expect(root.querySelectorAll('[data-m3n-control="meter"]')).toHaveLength(2)
    expect(root.querySelector('[data-m3n-control="segno"]')).not.toBeNull()
  })
})
