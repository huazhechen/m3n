import { expect, it } from 'vitest'
import { scoreCorePageLowerBound, scorePageFeasibility } from './height-feasibility.js'
import { scoreEnvelopeBlock } from './height-envelope.js'
import { prepareScorePagination, type ScorePageBlock } from './pagination.js'
import type { ScoreLineCandidate } from './line-breaking.js'

it('directional channels stay optimistic when upper and lower attachments move independently', () => {
  let seed = 853
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
  for (let trial = 0; trial < 200; trial++) {
    const actual: ScorePageBlock[] = [], bounds: ScorePageBlock[] = []
    for (let row = 0; row < 15; row++) {
      const fixed = { left: 0, right: 100, top: -10, bottom: 10 }
      const upper = { left: random() * 80, right: 110, top: -20 - random() * 30, bottom: -16 }
      const lower = { left: random() * 80, right: 110, top: 16, bottom: 20 + random() * 30 }
      const up = random() * 70, down = random() * 70
      const ink = [fixed, { ...upper, top: upper.top - up, bottom: upper.bottom - up }, { ...lower, top: lower.top + down, bottom: lower.bottom + down }]
      actual.push({ height: 100, core: fixed, ink, resolvedInk: true })
      bounds.push({ height: 100, core: fixed, lowerBoundGeometry: {
        top: upper.top, bottom: lower.bottom, topInk: [fixed, upper], bottomInk: [fixed, lower],
      } })
    }
    const options = { pageHeight: 300 + random() * 300, margin: 10, gap: 24, headerGap: 16 }
    const pages = prepareScorePagination(actual, {})(options).heights.length
    expect(scoreCorePageLowerBound(bounds, { ...options, directional: true })).toBeLessThanOrEqual(pages)
    const lazy = bounds.map(block => () => block)
    expect(scoreCorePageLowerBound(lazy, { ...options, directional: true, pageCeiling: 1 })).toBeLessThanOrEqual(pages)
  }
})

it('matches exhaustive full-width primitive pagination including headers, lyrics, fixed gaps and asymmetric cores', () => {
  let seed = 37
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  const witnessCache: {ends?:number[]} = {}
  for (let trial = 0; trial < 100; trial++) {
    const count = 4 + trial % 4
    const graph: ScoreLineCandidate[][] = Array.from({ length: count }, (_, start) =>
      Array.from({ length: Math.min(3, count - start) }, (_, index) => ({ end: start + index + 1, density: .5 })))
    const blocks = graph.map(rows => new Map(rows.map(row => {
      const block: ScorePageBlock = scoreEnvelopeBlock({ coreAbove: 5 + random() * 20, coreBelow: 5 + random() * 30,
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
    const feasible = scorePageFeasibility(graph, blockFor, headers, {...options,witnessCache})
    const restricted = graph.map(rows => rows.filter((_, index) => index === 0 || random() > .3))
    const paths = (start = 0): number[][] => start === count ? [[]] : restricted[start]!.flatMap(row =>
      paths(row.end).map(rest => [row.end, ...rest]))
    const minimumPages = Math.min(...paths().map(path => {
      let start = 0
      const music = path.map(end => { const block = blockFor(start, end); start = end; return block })
      return prepareScorePagination([...headers, ...music], { })(options).heights.length
    }))
    for (const ceiling of [1, 2, 3, 4]) expect(feasible(restricted, ceiling), String(trial)).toBe(minimumPages <= ceiling)
  }
})

it('never rejects feasible primitive layouts when only some row shapes are resolved', () => {
  let seed=79
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32}
  for(let trial=0;trial<60;trial++) {
    const count=5, graph:ScoreLineCandidate[][]=Array.from({length:count},(_,start)=>
      Array.from({length:Math.min(3,count-start)},(_,index)=>({end:start+index+1,density:.7})))
    const actual=graph.map(rows=>new Map(rows.map(row=>{
      const core={top:-6-random()*8,bottom:6+random()*10}
      const ink=[0,1,2].map(index=>({left:index*60,right:index*60+45,top:core.top-random()*20,bottom:core.bottom+random()*30}))
      return [row.end,{height:100,baseline:0,core,ink,resolvedInk:true} satisfies ScorePageBlock]
    })))
    const bounds=actual.map(rows=>new Map([...rows].map(([end,block])=>[end,random()<.6?block:
      {height:0,core:{top:0,bottom:0},ink:[],resolvedInk:false} satisfies ScorePageBlock])))
    const options={pageHeight:150,margin:0,gap:18,headerGap:15,}
    let witness:number[]=[]
    const feasible=scorePageFeasibility(graph,(start,end)=>bounds[start]!.get(end)!,[],{...options,onWitness:ends=>{witness=ends}})
    const paths=(start=0):number[][]=>start===count?[[]]:graph[start]!.flatMap(row=>paths(row.end).map(rest=>[row.end,...rest]))
    const pages=Math.min(...paths().map(path=>{
      let start=0
      return prepareScorePagination(path.map(end=>{const block=actual[start]!.get(end)!;start=end;return block}),{})(options).heights.length
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
  const blocks:ScorePageBlock[]=Array.from({length:20},()=>{
   const top=-5-random()*35,bottom=5+random()*35
   return {height:bottom-top,core:{top:top+3,bottom:bottom-3},gapBefore:random()*5,coreGapScale:random()<.5 ? .7 : 1,
    ink:Array.from({length:4},()=>{const left=random()*200;return {left,right:left+10,top,bottom}})}
  })
  const options={pageHeight:180+random()*150,margin:10,gap:24,headerGap:19.2}
  const actual=prepareScorePagination(blocks,{})(options).heights.length
  expect(scoreCorePageLowerBound(blocks,options)).toBeLessThanOrEqual(actual)
 }
})

it('reuses fixed-prefix pagination across branches and changing ceilings without changing witnesses',()=>{
 const graph:ScoreLineCandidate[][]=Array.from({length:18},(_,start)=>
  Array.from({length:Math.min(3,18-start)},(_,slot)=>({end:start+slot+1,density:.7})))
 const blockFor=(start:number,end:number):ScorePageBlock=>({height:25+end-start,
  core:{top:-8,bottom:12},ink:[{left:0,right:100,top:-10-start%3,bottom:15+(end-start)*2}],resolvedInk:true})
 const options={pageHeight:130,margin:4,gap:20,headerGap:15,}
 for(const headers of [[],[{height:20,ink:[{left:0,right:100,top:0,bottom:20}]}]]) {
  let witness:number[]=[]
  const shared=scorePageFeasibility(graph,blockFor,headers,{...options,onWitness:ends=>{witness=ends}})
  for(const last of [12,16,18,12])for(const ceiling of [1,5,2,4,5]) {
   const restricted=graph.map((rows,start)=>start<last ? rows.slice(0,1) : rows)
   let expected:number[]=[]
   const fresh=scorePageFeasibility(graph,blockFor,headers,{...options,onWitness:ends=>{expected=ends}})
   witness=[]
   expect(shared(restricted,ceiling)).toBe(fresh(restricted,ceiling))
   expect(witness).toEqual(expected)
  }
 }
})

it('resolves only the rows of an optimistic greedy witness before expanding alternatives',()=>{
 const count=20,graph:ScoreLineCandidate[][]=Array.from({length:count},(_,start)=>
  Array.from({length:Math.min(3,count-start)},(_,i)=>({end:start+i+1,density:.7})))
 let measured=0
 const blockFor=():ScorePageBlock=>{measured++;return {height:20,core:{top:0,bottom:20},ink:[{left:0,right:100,top:0,bottom:20}]}}
 const feasible=scorePageFeasibility(graph,blockFor,[],{pageHeight:1000,margin:0,gap:10,headerGap:0})
 expect(measured).toBe(0)
 expect(feasible(graph,1)).toBe(true)
 expect(measured).toBe(7)
 expect(feasible(graph,1)).toBe(true)
 expect(measured).toBe(7)
})

it('explores alternatives when the optimistic greedy witness does not fit',()=>{
 const graph:ScoreLineCandidate[][]=[[{end:1,density:.5},{end:2,density:.8}],[{end:3,density:.8}],[],[{end:4,density:.5}]]
 const feasible=scorePageFeasibility(graph,(start,end)=>{
  const height=start===0 && end===2 ? 200 : 20
  return {height,core:{top:0,bottom:height},ink:[{left:0,right:100,top:0,bottom:height}]}
 },[],{pageHeight:100,margin:0,gap:5,headerGap:0})
 expect(feasible(graph,1)).toBe(true)
})
