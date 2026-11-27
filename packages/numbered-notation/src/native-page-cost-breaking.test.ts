import {expect,it} from 'vitest'
import {planNativeLinesWithPageCost} from './native-page-cost-breaking.js'
import {nativeLinePlanCost} from './native-page-line-breaking.js'
import {prepareNativePagination,type NativePageBlock} from './native-pagination.js'
import type {NativeLineCandidate} from './native-line-breaking.js'

it('preserves complete-plan ties when many paths have identical page positions', () => {
 const block:NativePageBlock={height:20,core:{top:0,bottom:20},ink:[{left:0,right:1,top:0,bottom:20}],resolvedInk:true}
 for(let trial=0;trial<60;trial++) {
  const count=6,graph:NativeLineCandidate[][]=Array.from({length:count},(_,start)=>Array.from({length:Math.min(3,count-start)},(_,i)=>({end:start+i+1,density:[.3,.6,.9][(trial*(start+1)+i)%3]!})))
  const paths=(at=0):number[][]=>at===count ? [[]] : graph[at]!.flatMap(row=>paths(row.end).map(rest=>[row.end,...rest]))
  const options={pageHeight:65,margin:0,gap:5,headerGap:0,ratio:.3,wholeRows:true,ceiling:1+trial%3,maximumCost:100}
  const eligible=paths().filter(path=>prepareNativePagination(path.map(()=>block),{wholeRows:true,nonCoreGapRatio:.3})(options).heights.length<=options.ceiling)
  eligible.sort((a,b)=>{const delta=nativeLinePlanCost(graph,a)-nativeLinePlanCost(graph,b);if(Math.abs(delta)>1e-12)return delta;for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return b[i]!-a[i]!;return 0})
  expect(planNativeLinesWithPageCost(graph,()=>block,[],options)).toEqual(eligible[0])
 }
})

it('matches exhaustive global cost with exact whole-row page constraints',()=>{
 let seed=157
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32}
 for(let trial=0;trial<100;trial++){
  const count=5+trial%3,graph:NativeLineCandidate[][]=Array.from({length:count},(_,start)=>Array.from({length:Math.min(3,count-start)},(_,index)=>({end:start+index+1,density:.3+random()*.7})))
  const blocks=graph.map(rows=>new Map(rows.map(row=>{const top=-5-random()*20,bottom=5+random()*30;return [row.end,{height:bottom-top,core:{top:top+3,bottom:bottom-2},ink:[{left:0,right:100,top,bottom}],resolvedInk:true} satisfies NativePageBlock]})))
  const headers=[{height:20,ink:[{left:0,right:100,top:0,bottom:20}],resolvedInk:true}]
  const options={pageHeight:120,margin:0,gap:15,headerGap:12,ratio:.3,wholeRows:true,ceiling:1+trial%3,maximumCost:trial%2 ? 100 : .2+random()*2}
  const paths=(start=0):number[][]=>start===count?[[]]:graph[start]!.flatMap(row=>paths(row.end).map(rest=>[row.end,...rest]))
  const eligible=paths().filter(path=>{let start=0;const rows=path.map(end=>{const block=blocks[start]!.get(end)!;start=end;return block});return prepareNativePagination([...headers,...rows],{wholeRows:true,nonCoreGapRatio:.3})(options).heights.length<=options.ceiling})
  eligible.sort((a,b)=>{const delta=nativeLinePlanCost(graph,a)-nativeLinePlanCost(graph,b);if(Math.abs(delta)>1e-12)return delta;for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return b[i]!-a[i]!;return 0})
  const actual=planNativeLinesWithPageCost(graph,(start,end)=>blocks[start]!.get(end)!,headers,options)
  expect(actual,`trial ${trial}`).toEqual(eligible.find(path=>nativeLinePlanCost(graph,path)<=options.maximumCost+1e-12))
 }
})

it('preserves section mean statistics when they choose the ending geometry',async()=>{
 const {intersectNativeRowBounds}=await import('./native-row-bound.js')
 let seed=938
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32}
 for(let trial=0;trial<60;trial++) {
  const n=6,section=(at:number)=>at<3 ? 0 : 1
  const graph:NativeLineCandidate[][]=Array.from({length:n},(_,start)=>Array.from({length:Math.min(3-start%3,n-start)},(_,i)=>({end:start+i+1,density:.4+random()*.6})))
  const shapes=graph.map(rows=>new Map(rows.map(row=>{
   const shape=():NativePageBlock=>{const top=-10-random()*15,bottom=10+random()*15;return {height:bottom-top,core:{top:top+2,bottom:bottom-2},ink:[{left:0,right:100,top,bottom}],resolvedInk:true}}
   const full=shape(),inherited=shape();return [row.end,{full,inherited,lower:intersectNativeRowBounds([full,inherited]),gap:8+random()*20}]
  })))
  const gap=(start:number,end:number)=>shapes[start]!.get(end)!.gap
  const terminal=(_start:number,end:number)=>end===3 || end===6
  const blockFor=(start:number,end:number,_previous?:number,reference?:number)=>{
   const shape=shapes[start]!.get(end)!
   return !terminal(start,end) ? shape.full : reference===undefined ? shape.lower : shape.gap<=reference*1.5 ? shape.full : shape.inherited
  }
  const options={pageHeight:160,margin:0,gap:15,headerGap:12,ratio:.3,wholeRows:true,ceiling:1+trial%3,maximumCost:trial%2 ? 100 : .2+random()*2,reference:{section,gap,terminal}}
  const paths=(start=0):number[][]=>start===n ? [[]] : graph[start]!.flatMap(row=>paths(row.end).map(rest=>[row.end,...rest]))
  const eligible=paths().filter(path=>{
   let start=0,previous=-1,sum=0,count=0
   const blocks=path.map(end=>{
    const first=previous<0 || section(start)!==section(previous)
    if(first){sum=0;count=0}
    const block=blockFor(start,end,previous,first ? Infinity : count ? sum/count : 0)
    sum+=gap(start,end);count++;previous=start;start=end;return block
   })
   return prepareNativePagination(blocks,{wholeRows:true,nonCoreGapRatio:.3})(options).heights.length<=options.ceiling
  })
  eligible.sort((a,b)=>{const d=nativeLinePlanCost(graph,a)-nativeLinePlanCost(graph,b);if(Math.abs(d)>1e-12)return d;for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return b[i]!-a[i]!;return 0})
  expect(planNativeLinesWithPageCost(graph,blockFor,[],options),`mean trial ${trial}`).toEqual(eligible.find(path=>nativeLinePlanCost(graph,path)<=options.maximumCost+1e-12))
 }
})

it('applies the cost ceiling to the complete objective, including variance',()=>{
 const graph:NativeLineCandidate[][]=[[{end:1,density:.2}],[{end:2,density:.9}]]
 const block:NativePageBlock={height:20,core:{top:-10,bottom:10},ink:[{left:0,right:100,top:-10,bottom:10}],resolvedInk:true}
 const options={pageHeight:400,margin:0,gap:15,headerGap:12,ratio:.3,wholeRows:true,ceiling:1,maximumCost:.7}
 expect(planNativeLinesWithPageCost(graph,()=>block,[],options)).toBeUndefined()
 expect(planNativeLinesWithPageCost(graph,()=>block,[],{...options,maximumCost:1})).toEqual([1,2])
})

it('reuses common suffixes safely across cost windows and forced-prefix branches',()=>{
 let seed=171
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)
 for(let trial=0;trial<20;trial++) {
  const n=7,graph:NativeLineCandidate[][]=Array.from({length:n},(_,start)=>Array.from({length:Math.min(3,n-start)},(_,index)=>({end:start+index+1,density:.3+random()*.7})))
  const block:NativePageBlock={height:20,core:{top:-10,bottom:10},ink:[{left:0,right:100,top:-10,bottom:10}],resolvedInk:true}
  const variants=[graph,graph.map((rows,at)=>at===0 ? rows.slice(0,1) : rows),graph.map((rows,at)=>at===2 ? rows.slice(1) : rows),graph]
  for(const branch of variants)for(const cap of [2,.2,1,.4,3]) {
   const paths=(start=0):number[][]=>start===n ? [[]] : branch[start]!.flatMap(row=>paths(row.end).map(rest=>[row.end,...rest]))
   const valid=paths().filter(path=>nativeLinePlanCost(branch,path)<=cap+1e-12)
   valid.sort((a,b)=>{const delta=nativeLinePlanCost(branch,a)-nativeLinePlanCost(branch,b);if(Math.abs(delta)>1e-12)return delta;for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return b[i]!-a[i]!;return 0})
   const actual=planNativeLinesWithPageCost(branch,()=>block,[],{pageHeight:1000,margin:0,gap:24,headerGap:20,ratio:.3,wholeRows:true,ceiling:1,maximumCost:cap})
   expect(actual).toEqual(valid[0])
  }
 }
})

it('rejects a horizontally over-budget path before preparing its row geometry',()=>{
 const graph:NativeLineCandidate[][]=[
  [{end:1,density:.7},{end:2,density:1}],
  [{end:3,density:1}],
  [{end:3,density:1}],
 ]
 const prepared:string[]=[]
 const block:NativePageBlock={height:20,core:{top:-10,bottom:10},ink:[{left:0,right:100,top:-10,bottom:10}],resolvedInk:true}
 const actual=planNativeLinesWithPageCost(graph,(start,end)=>{prepared.push(`${start}:${end}`);return block},[],
  {pageHeight:100,margin:0,gap:15,headerGap:12,ratio:.3,wholeRows:true,ceiling:2,maximumCost:.1})
 expect(actual).toEqual([2,3])
 expect(prepared).not.toContain('0:1')
})

it('does not prepare unreachable rows when building single-page height bounds',()=>{
 const graph:NativeLineCandidate[][]=[[{end:2,density:1}],[{end:3,density:1}],[{end:3,density:1}]]
 const prepared:string[]=[]
 const block:NativePageBlock={height:20,core:{top:-10,bottom:10},ink:[{left:0,right:100,top:-10,bottom:10}],resolvedInk:true}
 const actual=planNativeLinesWithPageCost(graph,(start,end)=>{prepared.push(`${start}:${end}`);return block},[],
  {pageHeight:100,margin:0,gap:15,headerGap:12,ratio:.3,wholeRows:true,ceiling:1,maximumCost:1})
 expect(actual).toEqual([2,3])
 expect(prepared).not.toContain('1:3')
})
it('reuses predecessor geometry when a section does not require the running spacing mean',()=>{
 const graph:NativeLineCandidate[][]=Array.from({length:12},(_,start)=>
  Array.from({length:Math.min(3,12-start)},(_,offset)=>({end:start+offset+1,density:.4+((start*7+offset*3)%8)/20})))
 const blocks=new Map<string,NativePageBlock>()
 const options={pageHeight:240,margin:0,gap:15,headerGap:12,ratio:.3,wholeRows:true,ceiling:2,maximumCost:100}
 const run=(required:boolean)=>{
  let calls=0
  const plan=planNativeLinesWithPageCost(graph,(start,end,previousStart)=>{
   calls++
   const key=`${start}:${end}:${previousStart}`
   let block=blocks.get(key)
   if(!block){block={height:30,core:{top:-10,bottom:10},ink:[{left:0,right:100,top:-12,bottom:18+(previousStart ?? 0)%3}],resolvedInk:true};blocks.set(key,block)}
   return block
  },[],{...options,reference:{section:()=>0,gap:(start,end)=>end-start,terminal:(_start,end)=>end===graph.length,required:()=>required}})
  return {plan,calls}
 }
 const full=run(true),reused=run(false)
 expect(reused.plan).toEqual(full.plan)
 expect(reused.calls).toBeLessThan(full.calls)
})
