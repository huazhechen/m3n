// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { compileScore, RecordingPainter } from '@m3n/jpfun'
import { NativeSymbols } from './native-symbols.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativeArticulationSvg } from './native-articulations.js'
import { nativePathInk, nativeSvgInk } from './native-ink.js'

it.each([['str','accent',6],['str','accent',12],['str','accent',24],['breath','breath',5],['breath','breath',10],['breath','breath',20]] as const)('uses the complete project %s shape and scaled stroke', (mark,name,size) => {
  const node=compileScore(`@symbol(${name},size=${size}px)`).layout.objects[0]!, recording=new RecordingPainter()
  node.paint(recording)
  const svg=(mark==='str'&&size===12)||(mark==='breath'&&size===10)
    ? new NativeSymbols(new DefaultTextMeasurer()).rawMark(mark) : nativeArticulationSvg(mark,size)!
  const path=new DOMParser().parseFromString(`<svg>${svg}</svg>`,'image/svg+xml').querySelector('path')
  expect(path).not.toBeNull()
  const reference=recording.commands.find(c=>c.kind==='path')!
  if(reference.kind!=='path') throw new Error('missing project glyph')
  const d=reference.commands.map(c=>c.op==='Z'?'Z':c.op==='C'?`C${c.cx1} ${c.cy1} ${c.cx2} ${c.cy2} ${c.x} ${c.y}`:'x' in c?`${c.op}${c.x} ${c.y}`:'').join(' ')
  const box=nativePathInk(d), center=(box.left+box.right)/2
  const expected=reference.commands.flatMap(c=>c.op==='Z'?[]:c.op==='C'?[c.cx1-center,c.cy1-box.top,c.cx2-center,c.cy2-box.top,c.x-center,c.y-box.top]:'x'in c?[c.x-center,c.y-box.top]:[])
  expect(path!.getAttribute('d')!.match(/[MLCQZ]/g)).toEqual(reference.commands.map(c=>c.op))
  const actual=path!.getAttribute('d')!.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)/g)!.map(Number)
  expect(actual).toHaveLength(expected.length)
  actual.forEach((n,i)=>expect(n).toBeCloseTo(expected[i]!,5))
  expect(Number(path!.getAttribute('stroke-width')??0)).toBeCloseTo(reference.style?.strokeWidth??0,5)
  if(mark==='str') {
    expect(path!.getAttribute('stroke-linecap')).toBe('round')
    expect(path!.getAttribute('stroke-linejoin')).toBe('round')
  }
  expect(svg).not.toContain('<text')
  const ink=nativeSvgInk(svg,new DefaultTextMeasurer())
  expect(ink.left+ink.right).toBeCloseTo(0,5)
})


it('draws a breath independently of installed text fonts', () => {
  const painter=new NativeSymbols({measureText(){throw new Error('music contour must not measure text')}})
  expect(painter.rawMark('breath')).toContain('<path')
  expect(painter.rawMark('breath')).not.toContain('<text')
})
