// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileScore, ErrorDiagnostic } from '@m3n/jpfun'
import { parseM3NDocument } from '@m3n/notation'
import { projectNumberedScore } from './projection.js'
import { layoutNativeScore } from './native-layout.js'
import { nativeStyle } from './native-style.js'

const variants = [320,600,800,1000].flatMap(width => [false,true].map(paged => ({width,paged})))

describe('tuplet expressions remain outside rhythm brackets in both renderers', () => {
  it.each(variants)('orders every Clarinet Polka tuplet dynamic at width $width, paged=$paged', options => {
    const source = readFileSync(resolve('../../src/scores/dan_huang_guan_bo_er_ka_01.m3n'),'utf8')
    const document = parseM3NDocument(source)
    const projection = projectNumberedScore(document,options)
    const result = compileScore(projection.source,{alignRelations:true,autoWrap:true})
    expect(result.diagnostics.filter(item => item instanceof ErrorDiagnostic)).toEqual([])
    const outer = result.layout.attachments.filter(item => item.sourceSpan && /^@symbol\([^)]*above=/.test(projection.source.slice(item.sourceSpan.start,item.sourceSpan.end)))
    expect(outer.length).toBeGreaterThan(0)
    for (const mark of outer) {
      const overlapping = result.layout.attachments.filter(item => item.sourceSpan && projection.source.slice(item.sourceSpan.start,item.sourceSpan.end).startsWith('@tuplet(')
        && item.regions.some(r => mark.regions.some(m => m.line===r.line && m.track===r.track && m.x<=r.x+r.w && m.x+m.w>=r.x)))
      expect(overlapping.length).toBeGreaterThan(0)
      for (const bracket of overlapping) expect(mark.box.y+mark.box.h).toBeLessThan(bracket.box.y)
    }
    const native = layoutNativeScore(document,options)
    let checked = 0
    for (const system of native.systems) for (const relation of system.relations.filter(r => r.kind==='tuplet')) {
      const glyph = relation.first
      for (const mark of glyph.markLayout?.filter(m => /^(p{1,3}|f{1,3}|mp|mf)$/.test(m.name)) ?? []) {
        checked++
        expect(mark.top+mark.height).toBeLessThanOrEqual(system.relationLayout!.get(relation)!.ink.top-nativeStyle.markGap+.001)
      }
    }
    expect(checked).toBe(outer.length)
  })
})
