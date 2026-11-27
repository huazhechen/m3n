import {expect,it} from 'vitest'
import {intersectNativeRowBounds} from './native-row-bound.js'
import {sortedScoreInkSeparation} from './layout/ink-separation.js'
import type {ScorePageBlock} from './layout/pagination.js'
import type {NativeInk} from './native-ink.js'

it('matches exhaustive contour intersection with coincident edges, gaps and degenerate pieces',()=>{
 let seed=2741
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32}
 for(let trial=0;trial<100;trial++) {
  const blocks:ScorePageBlock[]=Array.from({length:1+trial%4},(_,variant)=>({height:50,baseline:variant*3,core:{top:-10,bottom:10},
   ink:Array.from({length:48},(_,at)=>{
    const left=Math.floor(random()*40),top=Math.floor(random()*30)-20
    return {left,right:left+(at%11===0 ? -2 : at%7===0 ? 0 : 1+Math.floor(random()*10)),top,bottom:top+1+Math.floor(random()*12)}
   })}))
  const variants=blocks.map(block=>block.ink!.map(p=>({...p,top:p.top-block.baseline!,bottom:p.bottom-block.baseline!})))
  const edges=[...new Set(variants.flatMap(ink=>ink.flatMap(p=>[p.left,p.right])))].sort((a,b)=>a-b)
  const expected:NativeInk[]=[]
  for(let at=1;at<edges.length;at++) {
   const left=edges[at-1]!,right=edges[at]!,columns=variants.map(ink=>ink.filter(p=>p.left<right && p.right>left))
   if(columns.some(column=>!column.length))continue
   const top=Math.max(...columns.map(column=>Math.min(...column.map(p=>p.top))))
   const bottom=Math.min(...columns.map(column=>Math.max(...column.map(p=>p.bottom))))
   if(bottom<top)continue
   const prior=expected.at(-1)
   if(prior?.right===left && prior.top===top && prior.bottom===bottom)prior.right=right
   else expected.push({left,right,top,bottom})
  }
  expect(intersectNativeRowBounds(blocks).ink).toEqual(expected)
  expect(intersectNativeRowBounds([...blocks].reverse()).ink).toEqual(expected)
 }
})

it('keeps common row contours optimistic for every variant and neighbor',()=>{
 let seed=915
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32}
 const block=():ScorePageBlock=>({height:40,core:{top:-10,bottom:10},ink:Array.from({length:8},()=>{
  const left=random()*80,top=-20+random()*20
  return {left,right:left+5+random()*20,top,bottom:top+5+random()*20}
 })})
 for(let trial=0;trial<100;trial++) {
  const variants=[block(),block(),block()],bound=intersectNativeRowBounds(variants),peer=block()
  const sorted=(b:ScorePageBlock)=>[...b.ink!].sort((a,b)=>a.left-b.left)
  for(const variant of variants) {
   expect(sortedScoreInkSeparation(sorted(bound),sorted(peer))).toBeLessThanOrEqual(sortedScoreInkSeparation(sorted(variant),sorted(peer))+1e-9)
   expect(sortedScoreInkSeparation(sorted(peer),sorted(bound))).toBeLessThanOrEqual(sortedScoreInkSeparation(sorted(peer),sorted(variant))+1e-9)
   expect(bound.boundaryInk![0]!.top).toBeGreaterThanOrEqual(Math.min(0,...variant.ink!.map(p=>p.top)))
   expect(bound.boundaryInk![0]!.bottom).toBeLessThanOrEqual(Math.max(0,...variant.ink!.map(p=>p.bottom)))
  }
 }
})
