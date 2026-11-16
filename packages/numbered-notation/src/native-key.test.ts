// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { DefaultTextMeasurer } from './native-measure.js'
import { measureNativeControl } from './native-controls.js'
import { NativeSymbols } from './native-symbols.js'
import { nativeSvgInk } from './native-ink.js'
import { nativeKeyGeometry } from './native-key.js'
import { layoutNativeScore } from './native-layout.js'

const measurer = new DefaultTextMeasurer()
const painter = new NativeSymbols(measurer)

describe('native measured key signatures', () => {
  it.each(['1=Bb','1=F#','6=Eb','6=C#'])('draws %s with vector accidentals before the tonic', key => {
    const control = measureNativeControl('key',key,measurer)
    const root = new DOMParser().parseFromString(`<svg>${painter.control(control)}</svg>`,'image/svg+xml')
    const texts = [...root.querySelectorAll('text')]
    expect(texts.map(node=>node.textContent)).toEqual([key.slice(0,2),key[2]])
    expect(root.querySelector('path')?.getAttribute('data-m3n-symbol')).toBe(key.endsWith('b') ? '♭' : '♯')
    const ink = nativeSvgInk(painter.control(control),measurer)
    expect(control.top).toBeCloseTo(-ink.top)
    expect(control.bottom).toBeCloseTo(ink.bottom)
    expect(control.width).toBeGreaterThanOrEqual(ink.right)
  })

  it('centers the key block on the measured music digit axis', () => {
    const control = measureNativeControl('key','1=F#',measurer)
    const ink = nativeSvgInk(painter.control(control),measurer)
    const digit = measurer.measureText('0',{fontSize:22,fontFamily:'M3N Numbers'})
    expect((ink.top+ink.bottom)/2).toBeCloseTo(digit.h/2-digit.baseline,3)
  })

  it('shows a single first-visit override without redundant pass labels', () => {
    const document = parseM3NDocument('{key=C}{2/4}{order=A@D,A@D}\n===A\nN: 1 2 ||')
    const keys = layoutNativeScore(document,{width:320,paged:false}).projection.glyphs.flatMap(glyph=>glyph.controls).filter(control=>control.kind==='key')
    expect(keys.map(control=>control.text)).toEqual(['1=D'])
    expect(keys[0]!.keyRows).toBeUndefined()
  })

  it('separates rows using measured accidental and text ink, even with unusual font metrics', () => {
    const tall = {measureText:(text:string) => ({w:text.length*8,h:40,baseline:5})}
    const rows = [{key:'1=C',label:'1–3'},{key:'1=Db',label:'4'}]
    const geometry = nativeKeyGeometry(rows,tall)
    const control = measureNativeControl('key','1=C',tall,rows)
    expect(control.anchor).toBeCloseTo(geometry.width/2)
    expect(geometry.rows[1]!.y).toBeGreaterThan(geometry.rows[0]!.height)
    const symbols = new NativeSymbols(tall)
    const ink = nativeSvgInk(symbols.control(control),tall)
    expect(ink.bottom-ink.top).toBeCloseTo(geometry.height,3)
  })

  it.each([320,600,800,1000].flatMap(width=>[false,true].map(paged=>({width,paged}))))('retains entry and internal modulation rows at $width, paged=$paged', options => {
    const document = parseM3NDocument('{key=C}{2/4}{order=A@D,A@D,A@Eb}\n===A\nN: 1 2 | {key=G}3 4 ||')
    const before = structuredClone(document)
    const layout = layoutNativeScore(document,options)
    const keys = layout.projection.glyphs.flatMap(glyph=>glyph.controls).filter(control=>control.kind==='key')
    expect(keys.map(control=>control.keyRows)).toEqual([
      [{key:'1=D',label:'1–2'},{key:'1=Eb',label:'3'}],
      [{key:'1=A',label:'1–2'},{key:'1=Bb',label:'3'}],
    ])
    expect(document).toEqual(before)
  })
})
