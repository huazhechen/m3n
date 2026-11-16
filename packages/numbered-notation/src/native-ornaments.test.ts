// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { compileScore, RecordingPainter } from '@m3n/jpfun'
import { parseM3NDocument } from '@m3n/notation'
import { nativeStyle } from './native-style.js'
import { nativeOrnamentSvg } from './native-ornaments.js'
import { nativeSvgInk } from './native-ink.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { layoutNativeScore } from './native-layout.js'
import { renderNativePages } from './native-svg.js'

const fallback = new DefaultTextMeasurer()
const fontIndependent: TextMeasurer = {measureText(text,style) {
  if (text === 'tr' || text === 'prall') throw new Error('Ornaments must not depend on text fonts')
  return fallback.measureText(text,style)
}}

it.each([['tr',12],['prall',6.6]] as const)('draws a centered %s silhouette at the music scale without text or stroke bounds', (name,height) => {
  const svg = nativeOrnamentSvg(name)!
  const ink = nativeSvgInk(svg,fontIndependent)
  expect(svg).not.toMatch(/<text|stroke=/)
  expect(svg).toContain('fill="#000"')
  expect(ink.left+ink.right).toBeCloseTo(0,3)
  expect(ink.bottom-ink.top).toBeCloseTo(nativeStyle.music*height/22,3)
  expect(ink.right-ink.left).toBeGreaterThan(nativeStyle.music*.5)
})

it.each(['tr', 'prall'])('preserves every %s reference curve and measured extent at each music scale', name => {
  for (const size of [6, 12, 24]) {
    const result = compileScore(`@symbol(${name},size=${size}px)`)
    const node = result.layout.objects[0]!, painter = new RecordingPainter()
    node.paint(painter)
    const svg = nativeOrnamentSvg(name, size)!
    const root = new DOMParser().parseFromString(`<svg>${svg}</svg>`, 'image/svg+xml')
    const paths = [...root.querySelectorAll('path')], reference = painter.commands.filter(c => c.kind === 'path')
    expect(paths).toHaveLength(reference.length)
    const ink = nativeSvgInk(svg, fontIndependent)
    expect(ink.top).toBeCloseTo(0, 5)
    expect(ink.left + ink.right).toBeCloseTo(0, 5)
    expect(ink.right - ink.left).toBeCloseTo(node.box.w, 5)
    expect(ink.bottom - ink.top).toBeCloseTo(node.box.h, 5)
    paths.forEach((path, index) => {
      const d = path.getAttribute('d')!, commands = reference[index]!.commands
      expect(d.match(/[MLCZ]/g)).toEqual(commands.map(c => c.op))
      const actual = d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g)!.map(Number)
      const expected = commands.flatMap(c => c.op === 'Z' ? [] : c.op === 'C'
        ? [c.cx1 - node.box.x - node.box.w / 2, c.cy1 - node.box.y, c.cx2 - node.box.x - node.box.w / 2, c.cy2 - node.box.y, c.x - node.box.x - node.box.w / 2, c.y - node.box.y]
        : 'x' in c ? [c.x - node.box.x - node.box.w / 2, c.y - node.box.y] : [])
      expect(actual).toHaveLength(expected.length)
      actual.forEach((value, coordinate) => expect(value).toBeCloseTo(expected[coordinate]!, 5))
    })
  }
})

it('leaves other marks to their own renderers', () => {
  for (const name of ['fermata', 'mordent', 'tr++', 'f', 'unknown']) expect(nativeOrnamentSvg(name)).toBeUndefined()
})

it.each([320,600,800,1000])('measures ornament ink with legal note/chord hosts and clears the tuplet at %s', width => {
  for (const paged of [false,true]) {
    const layout = layoutNativeScore(parseM3NDocument('{4/4}\nN: {p}([1 2 3:2]) [1e 3e 5e:h]{tr}{prall} 5 6 | {br} 1{tr}{f} 2 3 4 |||'),{width,paged,textMeasurer:fontIndependent})
    const root = new DOMParser().parseFromString(renderNativePages(layout).join(''),'text/html')
    expect(root.querySelectorAll('[data-m3n-mark="tr"] path')).toHaveLength(2)
    expect(root.querySelectorAll('[data-m3n-mark="prall"] path')).toHaveLength(1)
    const first = layout.projection.glyphs.find(g=>g.markLayout?.some(m=>m.name==='p'))!
    const dynamic = first.markLayout!.find(m=>m.name==='p')!
    const system = layout.systems.find(s=>s.measures.some(m=>m.columns.some(c=>c.glyphs.includes(first))))!
    const tuplet = [...system.relationLayout!].find(([r])=>r.kind==='tuplet')![1]
    expect(dynamic.top+dynamic.height).toBeLessThanOrEqual(tuplet.ink.top-nativeStyle.markGap+.001)
    for (const g of layout.projection.glyphs) for (const mark of g.markLayout ?? []) {
      if (!['tr','prall'].includes(mark.name)) continue
      const ink = nativeSvgInk(nativeOrnamentSvg(mark.name)!,fontIndependent)
      expect(mark.top).toBeCloseTo(mark.y+ink.top,3)
      expect(mark.height).toBeCloseTo(ink.bottom-ink.top,3)
      expect(g.top).toBeGreaterThanOrEqual(-mark.top-.001)
    }
  }
})
