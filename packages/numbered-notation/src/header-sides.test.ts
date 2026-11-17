// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { compileScore, ErrorDiagnostic, SvgPainter, defaultTextMeasurer, type VisualTemporalNode } from '@m3n/jpfun'
import { parseM3NDocument } from '@m3n/notation'
import { projectNumberedScore } from './projection.js'
import { nativeHeaderGeometry } from './native-header.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativeSvgPieces } from './native-ink.js'

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
    const source = plain.replace('{4/4}', `{composer=甲${'很长的署名'.repeat(9)}}{120qpm}{4/4}`)
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
    const pieces = (node: VisualTemporalNode) => {
      const painter = new SvgPainter()
      node.paint(painter)
      for (const decoration of node.decorations) decoration.paint?.(painter)
      const svg = painter.toSvg(result.layout.bounds).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
      return nativeSvgPieces(svg, { measureText(text, style) {
        const m = defaultTextMeasurer.measureText(text, style)
        return { ...m, h: m.inkBottom ?? m.h }
      } })
    }
    let conflictingPairs = 0
    for (const control of left.flatMap(pieces)) for (const credit of credits.flatMap(pieces)) {
      if (control.right + 16 > credit.left && credit.right > control.left) {
        conflictingPairs++
        expect(control.top).toBeGreaterThanOrEqual(credit.bottom + 5 - 1e-6)
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


describe('subtitle shares measured vertical space with the sides', () => {
  it.each([false, true])('shares all three columns when they fit, paged=%s', paged => {
    const source = '{title=标题}{subtitle=副标题}{singer=歌手}{composer=甲}{4/4}\nN: 1 2 3 4 |||'
    const native = nativeHeaderGeometry(parseM3NDocument(source), 1000, 32, measure)
    expect(native.signaturesTop).toBeCloseTo(native.subtitleTop, 4)
    expect(native.creditsTop).toBeCloseTo(native.subtitleTop, 4)
    const ref = reference(source, 1000, paged)
    const subtitle = ref.result.layout.objects.find(o => 'lines' in o.ast && (o.ast.lines as string[])[0] === '副标题')!
    expect(ref.top).toBeCloseTo(subtitle.box.y, 4)
    expect(ref.names.box.y).toBeCloseTo(subtitle.box.y, 4)
  })
})

it.each([
  { title: '标题', subtitle: '副标题', composer: '甲', singer: '', width: 320 },
  { title: '标题', subtitle: '副标题', composer: '甲', singer: '', width: 600 },
  { title: '标题', subtitle: '短行\n这是较长的第二行副标题', composer: '甲', singer: '歌手', width: 600 },
  { title: '多行\n主标题', subtitle: '这是需要自动折行的长副标题并且还包含第二行', composer: '甲', singer: '歌手', width: 320 },
  { title: '标题', subtitle: '副标题', composer: '甲很长很长很长的署名', singer: '', width: 600 },
  { title: '', subtitle: '副标题', composer: '甲', singer: '歌手', width: 1000 },
  { title: '', subtitle: '长副标题需要避让左右两侧的调拍速和作者信息', composer: '甲', singer: '', width: 320 },
  { title: '标题', subtitle: '', composer: '甲', singer: '歌手', width: 800 },
])('clears actual subtitle lines and matches both headers: $width, $title, $subtitle', ({ width, ...metadata }) => {
  const measured: typeof measure = { measureText(text, style) {
    const metrics = measure.measureText(text, style)
    return { ...metrics, inkBottom: metrics.h }
  } }
  const document = { ...parseM3NDocument('{4/4}\nN: 1 2 3 4 |||'), ...metadata }
  const native = nativeHeaderGeometry(document, width, 32, measured)
  const result = compileScore(projectNumberedScore(document, { width, paged: false, textMeasurer: measured }).source, { textMeasurer: measured })
  expect(result.diagnostics.filter(item => item instanceof ErrorDiagnostic)).toEqual([])
  const groups = { left: new SvgPainter(), center: new SvgPainter(), right: new SvgPainter() }
  for (const node of result.layout.objects) {
    let ast: typeof node.ast | null = node.ast
    while (ast && !('name' in ast && ['left', 'center', 'right'].includes(String(ast.name)) && 'owner' in ast)) ast = ast.parent
    if (ast) node.paint(groups[(ast as unknown as { name: keyof typeof groups }).name])
  }
  const root = new DOMParser().parseFromString(`<svg>${native.svg}</svg>`, 'image/svg+xml').documentElement
  const nativeGroups = [...root.children].filter(node => node.tagName === 'g')
  const fragments = {
    left: nativeGroups[1]!.outerHTML,
    center: [...root.children].filter(node => node.tagName === 'text').map(node => node.outerHTML).join(''),
    right: nativeGroups[0]!.outerHTML,
  }
  const fragment = (painter: SvgPainter) => painter.toSvg(result.layout.bounds).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
  for (const name of ['center', 'left', 'right'] as const) {
    const expected = nativeSvgPieces(fragment(groups[name]), measured)
    const actual = nativeSvgPieces(fragments[name], measured)
    expect(actual).toHaveLength(expected.length)
    actual.forEach((box, index) => {
      for (const side of ['left', 'right', 'top', 'bottom'] as const) expect(Math.abs(box[side] - expected[index]![side])).toBeLessThan(0.5)
    })
  }
  for (const fragmentsBySide of [fragments, Object.fromEntries(Object.entries(groups).map(([name, painter]) => [name, fragment(painter)]))]) {
    const centerInk = nativeSvgPieces(fragmentsBySide.center!, measured).filter(box => box.top >= native.subtitleTop - 0.01)
    for (const side of ['left', 'right'] as const) for (const box of nativeSvgPieces(fragmentsBySide[side]!, measured)) for (const center of centerInk) {
      if (Math.min(box.right, center.right) + 16 > Math.max(box.left, center.left) + 0.01) {
        expect(box.bottom <= center.top - 5 + 0.01 || box.top >= center.bottom + 5 - 0.01).toBe(true)
      }
    }
  }
})


it('keeps blank subtitle lines from creating invisible collision obstacles', () => {
  const source = '{title=标题}{composer=甲}{4/4}\nN: 1 2 3 4 |||'
  const document = { ...parseM3NDocument(source), subtitle: '\n' }
  const native = nativeHeaderGeometry(document, 240, 32, measure)
  expect(native.signaturesTop).toBeCloseTo(native.subtitleTop, 4)
  const result = compileScore(projectNumberedScore(document, { width: 240, paged: false }).source)
  const controls = result.layout.objects.filter(o => ['key', 'meter'].includes(o.ast.callName))
  expect(Math.min(...controls.map(o => o.box.y))).toBeCloseTo(native.signaturesTop, 4)
})
