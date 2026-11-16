// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { compileScore, ErrorDiagnostic } from '@m3n/jpfun'
import { parseM3NDocument } from '@m3n/notation'
import { projectNumberedScore } from './projection.js'
import { nativeHeaderGeometry } from './native-header.js'
import { numberedOrderLines } from './order-lines.js'
import { type TextMeasurer } from './native-measure.js'

const measured: TextMeasurer = { measureText(text,style) {
  const units = text === '演奏顺序：' ? 90 : text === '→' ? 8 : [...text].reduce((n,c)=>n+(c==='W'?18:c==='i'?2:8),0)
  const w = units*style.fontSize/16
  return {w,h:style.fontSize,baseline:style.fontSize*.8}
}}

it('fits narrow letters using actual bold text widths instead of character counts',()=>{
  expect(numberedOrderLines(['iiii','iiii'],140,measured)).toEqual([['iiii','iiii']])
  expect(numberedOrderLines(['WWWW','WWWW'],240,measured)).toEqual([['WWWW'],['WWWW']])
})

it('measures the first prefix, continuation arrows, frames and every inter-cell gap',()=>{
  // First row: 90 + 4 + 15 + 4 + 8 + 4 + 15 = 140.
  expect(numberedOrderLines(['A','B','C','D','E','F'],140,measured)).toEqual([['A','B'],['C','D','E','F']])
  expect(numberedOrderLines(['A','B'],139.9,measured)).toEqual([['A'],['B']])
})

it('measures bold labels and scales the entire row design with its text size',()=>{
  const styles: {fontWeight?:number; fontSize:number}[]=[]
  const recording: TextMeasurer = {measureText(text,style) {styles.push(style);return measured.measureText(text,style)}}
  const order=['A','B','C','D','E','F']
  expect(numberedOrderLines(order,280,recording,32)).toEqual(numberedOrderLines(order,140,measured,16))
  expect(styles.some(s=>s.fontWeight===700)).toBe(true)
  expect(styles.every(s=>s.fontSize===32)).toBe(true)
})

it('preserves label order, repetitions and indivisible names when even one label is wider than a line',()=>{
  expect(numberedOrderLines(['','WWWW','i','WWWW',''],30,measured)).toEqual([['WWWW'],['i'],['WWWW']])
  expect(numberedOrderLines(undefined,100,measured)).toEqual([])
})

it.each(['iiiiiiii','WWWW'])('shares measured order rows between engines with variable-width labels %s',name=>{
  const doc=parseM3NDocument(`{title=顺序}{order=${name},${name}}{4/4}\n===${name}\nN: 1 2 3 4 |||`)
  for (const width of [320,600,800,1000]) for (const paged of [false,true]) {
    const expected=width===320 && name==='WWWW' ? [[name],[name]] : [[name,name]]
    const header=nativeHeaderGeometry(doc,width,32,measured)
    expect(header.orderRows.map(row=>row.items.filter(item=>item.framed).map(item=>item.text))).toEqual(expected)
    const projection=projectNumberedScore(doc,{width,paged,textMeasurer:measured})
    const result=compileScore(projection.source,{textMeasurer:measured})
    expect(result.diagnostics.filter(d=>d instanceof ErrorDiagnostic)).toEqual([])
    const nodes=result.layout.objects.filter(o=>o.ast.callName==='text' && 'size' in o.ast && o.ast.size===16 && 'lines' in o.ast && (o.ast.lines as string[])[0]===name)
    expect(nodes).toHaveLength(2)
    expect(Math.abs(nodes[0]!.box.y-nodes[1]!.box.y)<.001).toBe(expected.length===1)
  }
})
