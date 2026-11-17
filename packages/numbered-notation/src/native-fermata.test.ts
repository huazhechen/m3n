// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { compileScore, RecordingPainter } from '@m3n/jpfun'
import { parseM3NDocument } from '@m3n/notation'
import { NativeSymbols } from './native-symbols.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativeSvgInk } from './native-ink.js'
import { layoutNativeScore } from './native-layout.js'
import { nativeFermataSvg } from './native-fermata.js'
import { nativeStyle } from './native-style.js'

it.each([6,12,24])('preserves the reference fermata curves, dot and scaled stroke at %s', size => {
  const result = compileScore(`@symbol(fermata,size=${size}px)`), node = result.layout.objects[0]!
  const painter = new RecordingPainter(); node.paint(painter)
  const svg = size === 12 ? new NativeSymbols(new DefaultTextMeasurer()).rawMark('fermata') : nativeFermataSvg(size)
  const ink = nativeSvgInk(svg,new DefaultTextMeasurer())
  const root = new DOMParser().parseFromString(`<svg>${svg}</svg>`, 'image/svg+xml')
  const path = root.querySelector('path')!, circle = root.querySelector('circle')!
  const reference = painter.commands.find(c => c.kind === 'path')!
  expect(reference.kind).toBe('path')
  if (reference.kind !== 'path') return
  expect(path.getAttribute('d')!.match(/[MLCQZ]/g)).toEqual(reference.commands.map(c => c.op))
  const expected = reference.commands.flatMap(c => c.op === 'Z' ? [] : c.op === 'C'
    ? [c.cx1-node.box.x-node.box.w/2,c.cy1-node.box.y+ink.top,c.cx2-node.box.x-node.box.w/2,c.cy2-node.box.y+ink.top,c.x-node.box.x-node.box.w/2,c.y-node.box.y+ink.top]
    : 'x' in c ? [c.x-node.box.x-node.box.w/2,c.y-node.box.y+ink.top] : [])
  const actual = path.getAttribute('d')!.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g)!.map(Number)
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value,i) => expect(value).toBeCloseTo(expected[i]!,4))
  expect(path.getAttribute('stroke-linecap')).toBe('round')
  expect(path.getAttribute('stroke-linejoin')).toBe('round')
  expect(Number(path.getAttribute('stroke-width'))).toBeCloseTo(reference.style!.strokeWidth!,4)
  const dot = painter.commands.find(c=>c.kind==='circle')!
  if (dot.kind !== 'circle') throw new Error('missing fermata dot')
  expect(Number(circle.getAttribute('cx'))).toBeCloseTo(dot.cx-node.box.x-node.box.w/2,4)
  expect(Number(circle.getAttribute('cy'))).toBeCloseTo(dot.cy-node.box.y+ink.top,4)
  expect(Number(circle.getAttribute('r'))).toBeCloseTo(dot.r,4)
  expect(ink.left+ink.right).toBeCloseTo(0,4)
})

it.each(['1{fermata}', '[1e3e5e:h]{fermata}', '1{ac(2e3e)}{fermata}'])('places the complete fermata ink with measured clearance: %s', music => {
  const layout = layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${music} 2 3 4 |||`),{width:800,paged:false})
  const glyph = layout.projection.glyphs.find(g=>g.markLayout?.some(m=>m.name==='fermata'))!
  const mark = glyph.markLayout!.find(m=>m.name==='fermata')!
  const ink = nativeSvgInk(new NativeSymbols(new DefaultTextMeasurer()).rawMark('fermata'),new DefaultTextMeasurer())
  expect(mark.top).toBeCloseTo(mark.y+ink.top,4)
  expect(mark.height).toBeCloseTo(ink.bottom-ink.top,4)
  const left = (mark.x??0)+mark.left, right = (mark.x??0)+mark.right
  const hostTop = Math.min(...glyph.musicInk!.filter(b=>b.right>left&&b.left<right).map(b=>b.top))
  expect(mark.top+mark.height).toBeCloseTo(hostTop-nativeStyle.markGap,4)
})
