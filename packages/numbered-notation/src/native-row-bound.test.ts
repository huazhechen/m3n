import {expect,it} from 'vitest'
import {intersectNativeRowBounds} from './native-row-bound.js'
import {sortedNativeInkSeparation} from './native-ink-separation.js'
import type {NativePageBlock} from './native-pagination.js'

it('keeps common row contours optimistic for every variant and neighbor',()=>{
 let seed=915
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32}
 const block=():NativePageBlock=>({height:40,core:{top:-10,bottom:10},ink:Array.from({length:8},()=>{
  const left=random()*80,top=-20+random()*20
  return {left,right:left+5+random()*20,top,bottom:top+5+random()*20}
 })})
 for(let trial=0;trial<100;trial++) {
  const variants=[block(),block(),block()],bound=intersectNativeRowBounds(variants),peer=block()
  const sorted=(b:NativePageBlock)=>[...b.ink!].sort((a,b)=>a.left-b.left)
  for(const variant of variants) {
   expect(sortedNativeInkSeparation(sorted(bound),sorted(peer))).toBeLessThanOrEqual(sortedNativeInkSeparation(sorted(variant),sorted(peer))+1e-9)
   expect(sortedNativeInkSeparation(sorted(peer),sorted(bound))).toBeLessThanOrEqual(sortedNativeInkSeparation(sorted(peer),sorted(variant))+1e-9)
   expect(bound.boundaryInk![0]!.top).toBeGreaterThanOrEqual(Math.min(0,...variant.ink!.map(p=>p.top)))
   expect(bound.boundaryInk![0]!.bottom).toBeLessThanOrEqual(Math.max(0,...variant.ink!.map(p=>p.bottom)))
  }
 }
})
