import { nativeLineStateHull, insertNativeLineStateHull, type NativeLineStatisticPlan, type NativeLineCandidate } from './native-line-breaking.js'
import type { NativePageBlock } from './native-pagination.js'
import { sortedNativeInkSeparation } from './native-ink-separation.js'
import type { NativeInk } from './native-ink.js'

type Box={top:number;bottom:number;coreTop:number;coreBottom:number;music:boolean;scale:number;gap?:number;before:number;ink:NativeInk[];resolved:boolean;sorted:boolean}
type State=NativeLineStatisticPlan & {start:number;gapSum:number;gapCount:number;box?:Box;page:number;baseline:number}
type HeightBounds={boxes:Box[];remaining:Map<number,number>[];pricedHeight:Map<number,number[]>[]}
export function createNativePageCostCache(){return {heightBounds:new WeakMap<object,HeightBounds>(),boxes:new WeakMap<NativePageBlock,Box>(),distances:new WeakMap<Box,WeakMap<Box,number>>(),policy:''}}
type Options={rowsToResolve?:Set<string>;cache?:ReturnType<typeof createNativePageCostCache>;pageHeight:number;margin:number;gap:number;headerGap:number;ratio:number;wholeRows:boolean;ceiling:number;maximumCost:number;reference?:{required?:(at:number)=>boolean;section:(at:number)=>number;gap:(start:number,end:number)=>number|undefined;terminal:(start:number,end:number)=>boolean}}
const box=(block:NativePageBlock):Box=>{
 const axis=block.baseline ?? 0
 const ink=(block.ink ?? []).map(piece=>({...piece,top:piece.top-axis,bottom:piece.bottom-axis}))
 const edges=[...ink,...(block.boundaryInk ?? []).map(piece=>({...piece,top:piece.top-axis,bottom:piece.bottom-axis}))]
 const top=Math.min(0,...edges.map(piece=>piece.top)),bottom=Math.max(0,...edges.map(piece=>piece.bottom))
 return {top,bottom,coreTop:block.core ? block.core.top-axis : top,coreBottom:block.core ? block.core.bottom-axis : bottom,
  music:Boolean(block.core),scale:block.coreGapScale ?? 1,gap:block.coreGapBefore,before:block.gapBefore ?? 0,ink,resolved:Boolean(block.resolvedInk),sorted:false}
}
const ends=(state:NativeLineStatisticPlan)=>{const result:number[]=[];for(let p:NativeLineStatisticPlan|undefined=state;p?.count;p=p.previous)result.push(p.end);return result.reverse()}
const objective=(state:NativeLineStatisticPlan)=>2*state.square-state.sum*state.sum/state.count+state.penalty
const earlier=(a:NativeLineStatisticPlan,b:NativeLineStatisticPlan)=>{const x=ends(a),y=ends(b);for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]!>y[i]!;return false}

/** Minimum horizontal cost in an optimistic Markov pagination model. The
 * full paginator also checks remote rows; unknown/ending shapes use lower
 * bounds. Thus this result is a bound/witness, never an unchecked final plan.
 * At equal last row/count, lower page position dominates for every suffix.
 * A point above the statistic hull of lower-position states cannot minimize
 * the concave final objective. No height quantization or frontier size cap. */
export function planNativeLinesWithPageCost(graph:readonly (readonly NativeLineCandidate[])[],
 blockFor:(start:number,end:number,previousStart?:number,reference?:number)=>NativePageBlock,headers:readonly NativePageBlock[],options:Options,timings?:Record<string,number>):number[]|undefined {
 const reusable=options.cache ?? createNativePageCostCache()
 const policy=`${options.gap}:${options.headerGap}:${options.ratio}:${options.wholeRows}`
 if(reusable.policy!==policy){reusable.policy=policy;reusable.distances=new WeakMap();reusable.heightBounds=new WeakMap()}
 const distances=reusable.distances
 const distance=(prior:Box,item:Box)=>{
  let peers=distances.get(prior)
  const cached=peers?.get(item)
  if(cached!==undefined)return cached
  const local=item.gap ?? options.gap*prior.scale
  const separation=prior.music && item.music ? local : options.headerGap
  const core=prior.coreBottom-item.coreTop+separation
  let collision=-Infinity
  if(prior.resolved && item.resolved && prior.bottom-item.top+local*options.ratio>core) {
   if(options.wholeRows)collision=prior.bottom-item.top
   else {
    if(!prior.sorted){prior.ink.sort((a,b)=>a.left-b.left);prior.sorted=true}
    if(!item.sorted){item.ink.sort((a,b)=>a.left-b.left);item.sorted=true}
    collision=sortedNativeInkSeparation(prior.ink,item.ink)
   }
  }
  const value=Math.max(core,collision+local*options.ratio)+item.before
  if(!peers){peers=new WeakMap();distances.set(prior,peers)}
  peers.set(item,value)
  return value
 }
 const cache=reusable.boxes,ids=new Map<Box,number>()
 const getBox=(block:NativePageBlock)=>{let item=cache.get(block);if(!item){item=box(block);cache.set(block,item)}if(!ids.has(item))ids.set(item,ids.size);return item}
 const contextBoxes=graph.map(rows=>new Map(rows.map(row=>[row.end,new Map<number,Box>()])))
 const boxes=graph.map((rows,start)=>new Map(rows.map(row=>[row.end,getBox(blockFor(start,row.end))])))
 // On a single page, the reverse shortest path is an admissible remaining
 // vertical span. Reject impossible prefixes before building their hulls.
 const multipliers=options.ceiling===1 ? [.003,.01,.03] : []
 const signature=[...boxes.flatMap(rows=>[...rows.values()])]
 let bounds=reusable.heightBounds.get(graph)
 if(!bounds || bounds.boxes.length!==signature.length || bounds.boxes.some((box,index)=>box!==signature[index])) {
  const remaining=graph.map(()=>new Map<number,number>())
  const pricedHeight=graph.map(()=>new Map<number,number[]>())
  if(options.ceiling===1)for(let start=graph.length-1;start>=0;start--)for(const row of graph[start]!) {
   const item=boxes[start]!.get(row.end)!
   let height=row.end===graph.length ? item.bottom : Infinity
   const prices=multipliers.map(price=>row.end===graph.length ? price*item.bottom : Infinity)
   if(row.end!==graph.length)for(const next of graph[row.end]!) {
    const step=distance(item,boxes[row.end]!.get(next.end)!)
    height=Math.min(height,step+remaining[row.end]!.get(next.end)!)
    const r=Math.max(0,1-next.density)
    const cost=r*r+(next.penalty ?? 0)+100*Math.max(0,next.density-1)**2
    const tail=pricedHeight[row.end]!.get(next.end)!
    for(let index=0;index<prices.length;index++)prices[index]=Math.min(prices[index]!,cost+multipliers[index]!*step+tail[index]!)
   }
   remaining[start]!.set(row.end,height)
   pricedHeight[start]!.set(row.end,prices)
  }
  bounds={boxes:signature,remaining,pricedHeight}
  reusable.heightBounds.set(graph,bounds)
 }
 const {remaining,pricedHeight}=bounds
 const advance=(item:Box,previous:State):{page:number;baseline:number}|undefined=>{
  const {margin,pageHeight}=options
  if(item.bottom-item.top>pageHeight-2*margin+1e-6)return
  let baseline=margin-item.top,page=previous.page
  if(previous.box){
   baseline=Math.max(baseline+item.before,previous.baseline+distance(previous.box,item))
   if(baseline+item.bottom>pageHeight-margin+1e-6){page++;baseline=margin-item.top}
  }
  if(page>=options.ceiling)return
  return {page,baseline}
 }
 let root:State={start:-1,gapSum:0,gapCount:0,end:0,count:0,sum:0,square:0,penalty:0,page:0,baseline:0}
 for(const header of headers){const item=box({...header,resolvedInk:true}),position=advance(item,root);if(!position)return;root={...root,...position,box:item}}
 const suffix=Array<number>(graph.length+1).fill(Infinity);suffix[graph.length]=0
 for(let start=graph.length-1;start>=0;start--)for(const row of graph[start]!){const r=Math.max(0,1-row.density);suffix[start]=Math.min(suffix[start]!,r*r+(row.penalty ?? 0)+100*Math.max(0,row.density-1)**2+suffix[row.end]!)}
 const suffixPlans=horizontalSuffixPlans(graph,options.maximumCost)
 const canFinish=(sum:number,square:number,count:number,penalty:number,end:number)=>{
  for(const group of suffixPlans[end]!) {
   if(square+penalty+group.minimumHalfOrdinate>options.maximumCost+1e-12)continue
   const k=count+group.count,base=2*square+penalty
   for(const suffix of group.points) {
    const s=sum+suffix.sum
    if(base+2*suffix.square+suffix.penalty-s*s/k<=options.maximumCost+1e-12)return true
   }
  }
  return false
 }
 const states=Array.from({length:graph.length+1},()=>new Map<string,State[]>())
 states[0]!.set('root',[root])
 let generated=0,retained=0,largest=0
 for(let start=0;start<graph.length;start++){
  for(const row of graph[start]!){
   const r=Math.max(0,1-row.density),penalty=(row.penalty ?? 0)+100*Math.max(0,row.density-1)**2
   const groups=new Map<string,State[]>()
   for(const frontier of states[start]!.values())for(const prior of frontier){
    const square=prior.square+r*r,totalPenalty=prior.penalty+penalty
    const prefixVariance=Math.max(0,square-(prior.sum+r)**2/(prior.count+1))
    if(square+totalPenalty+prefixVariance+suffix[row.end]!>options.maximumCost+1e-12)continue
    const reference=options.reference
    const first=prior.start<0 || reference && reference.section(start)!==reference.section(prior.start)
    const average=first ? Infinity : prior.gapCount ? prior.gapSum/prior.gapCount : 0
    const memo=contextBoxes[start]!.get(row.end)!
    let item=reference ? getBox(blockFor(start,row.end,prior.start,average)) : memo.get(prior.start)
    if(!item){item=getBox(blockFor(start,row.end,prior.start));memo.set(prior.start,item)}
    const position=advance(item,prior);if(!position)continue
    if(options.ceiling===1 && position.baseline+remaining[start]!.get(row.end)!>options.pageHeight-options.margin+1e-6)continue
    const priced=pricedHeight[start]!.get(row.end)
    if(priced?.some((bound,index)=>square+totalPenalty+prefixVariance+bound-multipliers[index]!*(options.pageHeight-options.margin-position.baseline)>options.maximumCost+1e-10))continue
    if(!canFinish(prior.sum+r,square,prior.count+1,totalPenalty,row.end))continue

    const gap=reference?.required && !reference.required(start) ? undefined : reference?.gap(start,row.end),terminal=reference?.terminal(start,row.end)
    const gapSum=terminal ? 0 : (first ? 0 : prior.gapSum)+(gap ?? 0)
    const gapCount=terminal ? 0 : (first ? 0 : prior.gapCount)+(gap===undefined ? 0 : 1)
    const state:State={...position,start,gapSum,gapCount,box:item,end:row.end,count:prior.count+1,sum:prior.sum+r,square,penalty:totalPenalty,previous:prior}
    const key=`${state.count}:${ids.get(item)}:${gapSum}:${gapCount}`,group=groups.get(key) ?? [];group.push(state);groups.set(key,group);generated++
   }
   for(const [groupKey,points] of groups){
    points.sort((a,b)=>a.page-b.page || a.baseline-b.baseline || (earlier(a,b)?-1:1))
    const hull:State[]=[]
    const frontier:State[]=[]
    for(const point of points)if(insertNativeLineStateHull(hull,point))frontier.push(point)
    if(frontier.length){states[row.end]!.set(`${start}:${groupKey}`,frontier);retained+=frontier.length;largest=Math.max(largest,frontier.length)}
   }
  }
  states[start]!.clear()
 }
 let best:State|undefined
 for(const frontier of states[graph.length]!.values())for(const point of frontier){
  if(objective(point)>options.maximumCost+1e-12)continue
  if(!best || objective(point)<objective(best)-1e-12 || Math.abs(objective(point)-objective(best))<=1e-12 && earlier(point,best))best=point
 }
 if(best && options.rowsToResolve)for(const frontier of states[graph.length]!.values())for(const point of frontier)
  if(objective(point)<=options.maximumCost+1e-12)
   for(let row:State|undefined=point;row?.count;row=row.previous as State|undefined)options.rowsToResolve.add(`${row.start}:${row.end}`)
 if((globalThis as {__m3nTraceWidths?:boolean}).__m3nTraceWidths)console.log('numeric-page-cost '+JSON.stringify({ceiling:options.maximumCost,states:generated,best:best ? objective(best) : null}))
 if(timings){timings.numericPageCostCalls=(timings.numericPageCostCalls ?? 0)+1;timings.numericPageCostStates=(timings.numericPageCostStates ?? 0)+generated;timings.numericPageCostRetained=(timings.numericPageCostRetained ?? 0)+retained;timings.numericPageCostMaximumFrontier=Math.max(timings.numericPageCostMaximumFrontier ?? 0,largest)}
 return best ? ends(best) : undefined
}

type SuffixGroup={count:number;minimumHalfOrdinate:number;points:NativeLineStatisticPlan[]}
const horizontalSuffixCache=new WeakMap<object,{maximumCost:number;groups:SuffixGroup[][]}>()
const suffixTokenEnd={}
const suffixTokenRows=new WeakMap<object,WeakMap<object,object>>()
const suffixTokens=new WeakMap<object,object[]>()
const suffixStatistics=new WeakMap<object,{maximumCost:number;states:Map<number,NativeLineStatisticPlan[]>}>()
function graphSuffixTokens(graph:readonly (readonly NativeLineCandidate[])[]) {
 const saved=suffixTokens.get(graph);if(saved)return saved
 const tokens:Array<object>=Array(graph.length+1);tokens[graph.length]=suffixTokenEnd
 for(let at=graph.length-1;at>=0;at--) {
  let next=suffixTokenRows.get(graph[at]!)
  if(!next){next=new WeakMap();suffixTokenRows.set(graph[at]!,next)}
  const tail=tokens[at+1]!
  let token=next.get(tail)
  if(!token){token={tail};next.set(tail,token)}
  tokens[at]=token
 }
 suffixTokens.set(graph,tokens)
 return tokens
}
function horizontalSuffixPlans(graph:readonly (readonly NativeLineCandidate[])[],maximumCost:number) {
 const cached=horizontalSuffixCache.get(graph)
 if(cached && cached.maximumCost>=maximumCost)return cached.groups
 const suffix=Array.from({length:graph.length+1},()=>new Map<number,NativeLineStatisticPlan[]>())
 const tokens=graphSuffixTokens(graph)
 suffix[graph.length]!.set(0,[{end:graph.length,count:0,sum:0,square:0,penalty:0}])
 for(let start=graph.length-1;start>=0;start--) {
  const saved=suffixStatistics.get(tokens[start]!)
  if(saved && saved.maximumCost>=maximumCost){suffix[start]=saved.states;continue}
  const groups=new Map<number,NativeLineStatisticPlan[]>()
  for(const row of graph[start]!)for(const points of suffix[row.end]!.values())for(const point of points) {
   const r=Math.max(0,1-row.density),count=point.count+1
   const candidate={end:graph.length,count,sum:point.sum+r,square:point.square+r*r,
    penalty:point.penalty+(row.penalty ?? 0)+100*Math.max(0,row.density-1)**2}
   if(candidate.square+candidate.penalty>maximumCost+1e-12)continue
   const list=groups.get(count) ?? [];list.push(candidate);groups.set(count,list)
  }
  for(const [count,points] of groups)suffix[start]!.set(count,nativeLineStateHull(points))
  suffixStatistics.set(tokens[start]!,{maximumCost,states:suffix[start]!})
 }
 const result=suffix.map(groups=>[...groups].sort((a,b)=>a[0]-b[0]).map(([count,points])=>({count,points,
  minimumHalfOrdinate:Math.min(...points.map(p=>p.square+p.penalty/2))})))
 horizontalSuffixCache.set(graph,{maximumCost,groups:result})
 return result
}
