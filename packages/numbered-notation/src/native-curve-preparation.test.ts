import {expect,it} from 'vitest'
import {nativeArcSlice,prepareNativeArc} from './native-curve.js'
import type {NativeArcCommand} from './native-arc.js'

it('prepared curve queries exactly match the uncached inverse search in either direction', () => {
  let seed=1977
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)
  for(let trial=0;trial<150;trial++) {
    const a=(random()-.5)*1e5,span=(random()*1200+1)*(trial%2?-1:1),b=a+span,y=(random()-.5)*100,height=random()*50,thickness=random()*3+.01
    const commands:NativeArcCommand[]=[{op:'M',x:a,y},
      {op:'C',cx1:a+span/4,cy1:y-height,cx2:b-span/4,cy2:y-height,x:b,y},
      {op:'Q',cx:(a+b)/2,cy:y-height+thickness,x:a,y:y+thickness},{op:'L',x:a,y},{op:'Z'}]
    const prepared=prepareNativeArc(commands)
    for(const x of [a,b,(a+b)/2,...Array.from({length:20},()=>a+span*(random()*1.2-.1))]) {
      for(const slopes of [false,true]) {
        expect(prepared.slice(x,slopes)).toEqual(nativeArcSlice(commands,x,slopes))
        expect(prepared.slice(x,slopes)).toEqual(nativeArcSlice(commands,x,slopes))
      }
    }
  }
})
it('curve preparation is a private immutable snapshot, with bounded query reuse', () => {
  const commands:NativeArcCommand[]=[{op:'M',x:0,y:0},{op:'Q',cx:50,cy:-20,x:100,y:0}]
  const a=prepareNativeArc(commands),b=prepareNativeArc(commands),before=a.slice(50)
  expect(a.slice(50)).toBe(before)
  expect(b.slice(50)).not.toBe(before)
  expect(Object.isFrozen(before)).toBe(true)
  commands[1]={op:'Q',cx:50,cy:-40,x:100,y:0}
  expect(a.slice(50)).toEqual(before)
  expect(prepareNativeArc(commands).slice(50)).not.toEqual(before)
  for(let i=0;i<600;i++) expect(b.slice(i/6)).toEqual(nativeArcSlice([{op:'M',x:0,y:0},{op:'Q',cx:50,cy:-20,x:100,y:0}],i/6))
})
