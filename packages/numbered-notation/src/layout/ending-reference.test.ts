import {expect,it} from 'vitest'
import {scoreEndingReferences} from './ending-reference.js'
import type {ScoreLineCandidate} from './line-breaking.js'

it('matches exhaustive mean ranges with forced prefixes and missing gaps',()=>{
 for(let trial=0;trial<40;trial++) {
  const n=7,graph:ScoreLineCandidate[][]=Array.from({length:n},(_,start)=>Array.from({length:Math.min(3,n-start)},(_,i)=>({end:start+i+1,density:.5})))
  if(trial%2)graph[0]=graph[0]!.slice(0,1)
  const gap=(start:number,end:number)=> (start+end+trial)%5===0 ? undefined : 8+(start*3+end*7+trial)%29
  const references=scoreEndingReferences(graph,()=>0,gap)
  const paths=(start:number,end:number):number[][]=>start===end ? [[]] : graph[start]!.filter(row=>row.end<=end).flatMap(row=>paths(row.end,end).map(rest=>[row.end,...rest]))
  expect(references[0]).toEqual({minimum:Infinity,maximum:Infinity})
  for(let end=1;end<n;end++) {
   const means=paths(0,end).map(path=>{let start=0;const gaps=path.flatMap(to=>{const g=gap(start,to);start=to;return g===undefined ? [] : [g]});return gaps.length ? gaps.reduce((a,b)=>a+b,0)/gaps.length : 0})
   expect(references[end]).toEqual({minimum:Math.min(...means),maximum:Math.max(...means)})
  }
 }
})

it('resets means at named section boundaries in the same musical part',()=>{
 const graph:ScoreLineCandidate[][]=[[{end:1,density:.5}],[{end:2,density:.5}],[{end:3,density:.5}],[{end:4,density:.5}]]
 const result=scoreEndingReferences(graph,at=>at<2 ? 0 : 1,start=>start<2 ? 100 : 8)
 expect(result).toEqual([{minimum:Infinity,maximum:Infinity},{minimum:100,maximum:100},
  {minimum:Infinity,maximum:Infinity},{minimum:8,maximum:8}])
})
