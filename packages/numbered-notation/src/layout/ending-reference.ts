import type {ScoreLineCandidate} from './line-breaking.js'

/** Exact range of preceding full-row mean gaps, including forced prefixes.
 * Keep extrema at each row count, then take extrema of sum/count. */
export function scoreEndingReferences(graph:readonly (readonly ScoreLineCandidate[])[],
 section:(at:number)=>number,gapFor:(start:number,end:number)=>number|undefined):{minimum:number;maximum:number}[] {
 const states=Array.from({length:graph.length+1},()=>new Map<number,{low:number;high:number}>())
 const result:{minimum:number;maximum:number}[]=[]
 for(let start=0;start<graph.length;start++) {
  const first=!start || section(start)!==section(start-1)
  if(first){states[start]!.clear();states[start]!.set(0,{low:0,high:0})}
  const points=[...states[start]!]
  result[start]=first ? {minimum:Infinity,maximum:Infinity} : {
   minimum:Math.min(...points.map(([count,p])=>count ? p.low/count : 0)),
   maximum:Math.max(...points.map(([count,p])=>count ? p.high/count : 0))}
  for(const row of graph[start]!) {
   // Nothing reads statistics after the final row or across a section reset.
   if(!points.length || row.end===graph.length || section(row.end)!==section(start))continue
   const gap=gapFor(start,row.end)
   for(const [count,p] of points) {
    const next=count+(gap===undefined ? 0 : 1),low=p.low+(gap ?? 0),high=p.high+(gap ?? 0)
    const previous=states[row.end]!.get(next)
    states[row.end]!.set(next,{low:Math.min(previous?.low ?? Infinity,low),high:Math.max(previous?.high ?? -Infinity,high)})
   }
  }
 }
 return result
}
