// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { compileScore, ErrorDiagnostic } from '@m3n/jpfun'
import { parseM3NDocument } from '@m3n/notation'
import { projectNumberedScore } from './projection.js'
import { nativeHeaderGeometry } from './native-header.js'
import { DefaultTextMeasurer } from './native-measure.js'

const plain = '{title=谱头}{4/4}\nN: 1 2 3 4 |||'
const measure = new DefaultTextMeasurer()
function reference(source: string, width: number, paged: boolean) {
  const projection = projectNumberedScore(parseM3NDocument(source), {width, paged})
  const result = compileScore(projection.source)
  expect(result.diagnostics.filter(item => item instanceof ErrorDiagnostic)).toEqual([])
  const controls = result.layout.objects.filter(o => ['key','meter','tempo'].includes(o.ast.callName))
  const names = result.layout.objects.find(o => o.ast.callName === 'text' && 'lines' in o.ast && (o.ast.lines as string[])[0] === '甲')!
  return {top: Math.min(...controls.map(o => o.box.y)), names, result}
}

describe('measured header side arrangement in both engines', () => {
  it.each([320, 599, 600, 800, 1000].flatMap(width => [false,true].map(paged => ({width,paged}))))('shares the top when content fits at $width, paged=$paged', ({width,paged}) => {
    const one = plain.replace('{4/4}', '{composer=甲}{4/4}')
    const many = plain.replace('{4/4}', '{lyricist=甲}{composer=乙}{arranger=丙}{singer=丁}{4/4}')
    const a = reference(one,width,paged), b = reference(many,width,paged)
    expect(a.top).toBeCloseTo(b.top,5)
    expect(b.top).toBeCloseTo(b.names.box.y,5)
    const native = [one,many].map(source => nativeHeaderGeometry(parseM3NDocument(source),width,32,measure))
    expect(native[0]!.signaturesTop).toBeCloseTo(native[1]!.signaturesTop,5)
    expect(native[1]!.signaturesTop).toBeCloseTo(native[1]!.creditsTop,5)
  })

  it('stacks genuinely conflicting long credits above the signature on wide pages', () => {
    const source = plain.replace('{4/4}', `{composer=甲${'很长的署名'.repeat(7)}}{120qpm}{4/4}`)
    const document = parseM3NDocument(source)
    const projection = projectNumberedScore(document,{width:800,paged:false})
    const result = compileScore(projection.source)
    expect(result.diagnostics.filter(item => item instanceof ErrorDiagnostic)).toEqual([])
    const names = result.layout.objects.find(o => o.ast.callName === 'text' && 'lines' in o.ast && (o.ast.lines as string[])[0]?.startsWith('甲'))!
    const controls = result.layout.objects.filter(o => ['key','meter','tempo'].includes(o.ast.callName))
    expect(Math.min(...controls.map(o => o.box.y))).toBeGreaterThan(names.box.y+names.box.h)
    const native = nativeHeaderGeometry(document,800,32,measure)
    expect(native.signaturesTop).toBeGreaterThan(native.creditsTop)
  })
})
