import { expect, it } from 'vitest'
import { nativeCorePageLowerBound, nativePageFeasibility } from './native-height-feasibility.js'
import { nativeEnvelopeBlock } from './native-height-envelope.js'
import { prepareNativePagination, type NativePageBlock } from './native-pagination.js'
import type { NativeLineCandidate } from './native-line-breaking.js'

it('matches exhaustive full-width primitive pagination including headers, lyrics, fixed gaps and asymmetric cores', () => {
  let seed = 37
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  for (let trial = 0; trial < 100; trial++) {
    const count = 4 + trial % 4
    const graph: NativeLineCandidate[][] = Array.from({ length: count }, (_, start) =>
      Array.from({ length: Math.min(3, count - start) }, (_, index) => ({ end: start + index + 1, density: .5 })))
    const blocks = graph.map(rows => new Map(rows.map(row => {
      const block: NativePageBlock = nativeEnvelopeBlock({ coreAbove: 5 + random() * 20, coreBelow: 5 + random() * 30,
        extraAbove: random() * 20, extraBelow: random() * 20, hasLyrics: false }, 500, -9)
      block.resolvedInk = true
      block.coreGapScale = trial % 2 ? .7 : 1
      if (random() < .15) block.coreGapBefore = random() * 15
      block.gapBefore = random() < .2 ? 10 : 0
      return [row.end, block]
    })))
    const headers = [{ resolvedInk: true, height: 30, ink: [{ left: 0, right: 100, top: 0, bottom: 30 }] }]
    const blockFor = (start: number, end: number) => blocks[start]!.get(end)!
    const options = { pageHeight: 160 + random() * 120, margin: 5, gap: 20, headerGap: 17,}
    const feasible = nativePageFeasibility(graph, blockFor, headers, options)
    const restricted = graph.map(rows => rows.filter((_, index) => index === 0 || random() > .3))
    const paths = (start = 0): number[][] => start === count ? [[]] : restricted[start]!.flatMap(row =>
      paths(row.end).map(rest => [row.end, ...rest]))
    const minimumPages = Math.min(...paths().map(path => {
      let start = 0
      const music = path.map(end => { const block = blockFor(start, end); start = end; return block })
      return prepareNativePagination([...headers, ...music], { })(options).heights.length
    }))
    for (const ceiling of [1, 2, 3, 4]) expect(feasible(restricted, ceiling), String(trial)).toBe(minimumPages <= ceiling)
  }
})

it('never rejects feasible primitive layouts when only some row shapes are resolved', () => {
  let seed=79
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32}
  for(let trial=0;trial<60;trial++) {
    const count=5, graph:NativeLineCandidate[][]=Array.from({length:count},(_,start)=>
      Array.from({length:Math.min(3,count-start)},(_,index)=>({end:start+index+1,density:.7})))
    const actual=graph.map(rows=>new Map(rows.map(row=>{
      const core={top:-6-random()*8,bottom:6+random()*10}
      const ink=[0,1,2].map(index=>({left:index*60,right:index*60+45,top:core.top-random()*20,bottom:core.bottom+random()*30}))
      return [row.end,{height:100,baseline:0,core,ink,resolvedInk:true} satisfies NativePageBlock]
    })))
    const bounds=actual.map(rows=>new Map([...rows].map(([end,block])=>[end,random()<.6?block:
      {height:0,core:{top:0,bottom:0},ink:[],resolvedInk:false} satisfies NativePageBlock])))
    const options={pageHeight:150,margin:0,gap:18,headerGap:15,}
    let witness:number[]=[]
    const feasible=nativePageFeasibility(graph,(start,end)=>bounds[start]!.get(end)!,[],{...options,onWitness:ends=>{witness=ends}})
    const paths=(start=0):number[][]=>start===count?[[]]:graph[start]!.flatMap(row=>paths(row.end).map(rest=>[row.end,...rest]))
    const pages=Math.min(...paths().map(path=>{
      let start=0
      return prepareNativePagination(path.map(end=>{const block=actual[start]!.get(end)!;start=end;return block}),{})(options).heights.length
    }))
    for(const ceiling of [1,2,3]) {
      const accepted=feasible(graph,ceiling)
      if(pages<=ceiling) expect(accepted).toBe(true)
      if(accepted) expect(witness.at(-1)).toBe(count)
    }
  }
})

it('core-only page floors never exceed full primitive pagination',()=>{
 let seed=473
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)
 for(let trial=0;trial<100;trial++) {
  const blocks:NativePageBlock[]=Array.from({length:20},()=>{
   const top=-5-random()*35,bottom=5+random()*35
   return {height:bottom-top,core:{top:top+3,bottom:bottom-3},gapBefore:random()*5,coreGapScale:random()<.5 ? .7 : 1,
    ink:Array.from({length:4},()=>{const left=random()*200;return {left,right:left+10,top,bottom}})}
  })
  const options={pageHeight:180+random()*150,margin:10,gap:24,headerGap:19.2}
  const actual=prepareNativePagination(blocks,{})(options).heights.length
  expect(nativeCorePageLowerBound(blocks,options)).toBeLessThanOrEqual(actual)
 }
})

it('reuses fixed-prefix pagination across branches and changing ceilings without changing witnesses',()=>{
 const graph:NativeLineCandidate[][]=Array.from({length:18},(_,start)=>
  Array.from({length:Math.min(3,18-start)},(_,slot)=>({end:start+slot+1,density:.7})))
 const blockFor=(start:number,end:number):NativePageBlock=>({height:25+end-start,
  core:{top:-8,bottom:12},ink:[{left:0,right:100,top:-10-start%3,bottom:15+(end-start)*2}],resolvedInk:true})
 const options={pageHeight:130,margin:4,gap:20,headerGap:15,}
 for(const headers of [[],[{height:20,ink:[{left:0,right:100,top:0,bottom:20}]}]]) {
  let witness:number[]=[]
  const shared=nativePageFeasibility(graph,blockFor,headers,{...options,onWitness:ends=>{witness=ends}})
  for(const last of [12,16,18,12])for(const ceiling of [1,5,2,4,5]) {
   const restricted=graph.map((rows,start)=>start<last ? rows.slice(0,1) : rows)
   let expected:number[]=[]
   const fresh=nativePageFeasibility(graph,blockFor,headers,{...options,onWitness:ends=>{expected=ends}})
   witness=[]
   expect(shared(restricted,ceiling)).toBe(fresh(restricted,ceiling))
   expect(witness).toEqual(expected)
  }
 }
})
