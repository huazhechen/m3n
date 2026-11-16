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
  const names = result.layout.objects.find(o => o.ast.callName === 'text' && 'lines' in o.ast && /^甲 (作词|作曲)$/.test((o.ast.lines as string[])[0] ?? ''))!
  return {top: Math.min(...controls.map(o => o.box.y)), names, result}
}

describe('measured header side arrangement in both engines', () => {
  it.each([320, 599, 600, 800, 1000].flatMap(width => [false,true].map(paged => ({width,paged}))))('shares the top when content fits at $width, paged=$paged', ({width,paged}) => {
    const one = plain.replace('{4/4}', '{composer=甲}{4/4}')
    const many = plain.replace('{4/4}', '{lyricist=甲}{composer=乙}{4/4}')
    const a = reference(one,width,paged), b = reference(many,width,paged)
    expect(a.top).toBeCloseTo(b.top,5)
    expect(b.top).toBeCloseTo(b.names.box.y,5)
    const native = [one,many].map(source => nativeHeaderGeometry(parseM3NDocument(source),width,32,measure))
    expect(native[0]!.signaturesTop).toBeCloseTo(native[1]!.signaturesTop,5)
    expect(native[1]!.signaturesTop).toBeCloseTo(native[1]!.creditsTop,5)
  })

  it('clears only truly intersecting credit ink on wide pages', () => {
    const source = plain.replace('{4/4}', `{composer=甲${'很长的署名'.repeat(7)}}{120qpm}{4/4}`)
    const document = parseM3NDocument(source)
    const projection = projectNumberedScore(document,{width:800,paged:false})
    const result = compileScore(projection.source)
    expect(result.diagnostics.filter(item => item instanceof ErrorDiagnostic)).toEqual([])
    const credits = result.layout.objects.filter(o => o.ast.callName === 'text' && 'lines' in o.ast
      && (o.ast.lines as string[])[0]?.startsWith('甲'))
    expect(credits).toHaveLength(1)
    const left = result.layout.objects.filter(o => {
      let ast: typeof o.ast | null = o.ast
      while (ast) {
        if ('name' in ast && ast.name === 'left' && 'owner' in ast) return o.box.w > 0 && o.box.h > 0
        ast = ast.parent
      }
      return false
    })
    let conflictingPairs = 0
    for (const control of left) for (const credit of credits) {
      if (control.box.x + control.box.w + 16 > credit.box.x && credit.box.x + credit.box.w > control.box.x) {
        conflictingPairs++
        expect(control.box.y).toBeGreaterThanOrEqual(credit.box.y + credit.box.h + 5 - 1e-6)
      }
    }
    expect(conflictingPairs).toBeGreaterThan(0)
    const native = nativeHeaderGeometry(document,800,32,measure)
    expect(native.signaturesTop).toBeGreaterThan(native.creditsTop)
  })
  it.each([false, true])('keeps origin width independent from other credit rows, paged=%s', paged => {
    const roles = '{lyricist=甲}{composer=乙}{arranger=丙}{singer=丁}'
    const without = plain.replace('{4/4}', roles + '{4/4}')
    const withOrigin = plain.replace('{4/4}', roles + '{origin=这是一段非常长的曲调来源说明文字}{4/4}')
    const a = reference(without, 320, paged), b = reference(withOrigin, 320, paged)
    expect(b.names.box.x).toBeCloseTo(a.names.box.x, 5)
    expect(b.names.box.w).toBeCloseTo(a.names.box.w, 5)
    const labels = [without, withOrigin].map(source => {
      const geometry = nativeHeaderGeometry(parseM3NDocument(source), 320, 32, measure)
      const root = new DOMParser().parseFromString(`<svg>${geometry.svg}</svg>`, 'text/html')
      return [...root.querySelectorAll('text')].find(text => text.textContent === '甲 作词')!
    })
    expect(labels[0]!.getAttribute('x')).toBe(labels[1]!.getAttribute('x'))
  })

  it.each([320, 800].flatMap(width => [false, true].map(paged => ({ width, paged }))))('shares the requested credit and subtitle policy at $width, paged=$paged', ({ width, paged }) => {
    const document = parseM3NDocument('{title=曲名}{subtitle=原副标题}{singer=歌手}{lyricist=甲}{composer=乙}{arranger=丙}{origin=传统曲调}{4/4}\nN: 1 2 3 4 |||')
    const projection = projectNumberedScore(document, { width, paged })
    const result = compileScore(projection.source)
    expect(result.diagnostics.filter(item => item instanceof ErrorDiagnostic)).toEqual([])
    const texts = result.layout.objects.filter(o => o.ast.callName === 'text' && 'lines' in o.ast)
    for (const value of ['甲 作词', '乙 作曲', '传统曲调']) {
      const credit = texts.find(o => (o.ast as unknown as { lines: string[] }).lines[0] === value)!
      expect(credit).toBeDefined()
      expect(credit.box.x + credit.box.w).toBeCloseTo(width - 32)
    }
    const subtitleRows = ['原副标题', '歌手 演唱'].map(value => texts.find(o => (o.ast as unknown as { lines: string[] }).lines[0] === value)!)
    for (const row of subtitleRows) expect(row.box.x + row.box.w / 2).toBeCloseTo(width / 2, 4)
    expect(subtitleRows[1]!.box.y).toBeGreaterThan(subtitleRows[0]!.box.y + subtitleRows[0]!.box.h)
    const native = nativeHeaderGeometry(document, width, 32, measure)
    expect(native.subtitle).toEqual(['原副标题', '歌手 演唱'])
    const root = new DOMParser().parseFromString(`<svg>${native.svg}</svg>`, 'text/html')
    const nativeTexts = [...root.querySelectorAll('text')]
    for (const value of ['甲 作词', '乙 作曲', '传统曲调']) {
      const credit = nativeTexts.find(text => text.textContent === value)!
      expect(credit.getAttribute('text-anchor')).toBe('end')
      expect(Number(credit.getAttribute('x'))).toBe(width - 32)
    }
    const singer = nativeTexts.find(text => text.textContent === '歌手 演唱')!
    expect(singer.getAttribute('text-anchor')).toBe('middle')
    expect(Number(singer.getAttribute('x'))).toBe(width / 2)
    expect(nativeTexts.some(text => text.textContent?.includes('丙'))).toBe(false)
    expect(document.arranger).toBe('丙')
  })

})
