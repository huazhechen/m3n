import type { NativePageBlock } from './native-pagination.js'
import type { NativeInk } from './native-ink.js'

/** Common vertical envelope of finitely many possible row geometries. Every
 * contour is inside every variant's contour; inter-row separation and page
 * edges therefore remain optimistic, including shortened section endings. */
export function intersectNativeRowBounds(blocks: readonly NativePageBlock[]): NativePageBlock {
  const variants=blocks.map(block=>{
    const axis=block.baseline ?? 0
    const ink=(block.ink ?? []).map(p=>({...p,top:p.top-axis,bottom:p.bottom-axis}))
    const edges=[...ink,...(block.boundaryInk ?? []).map(p=>({...p,top:p.top-axis,bottom:p.bottom-axis}))]
    return {ink,top:Math.min(0,...edges.map(p=>p.top)),bottom:Math.max(0,...edges.map(p=>p.bottom)),
      core:{top:block.core!.top-axis,bottom:block.core!.bottom-axis}}
  })
  const edges=[...new Set(variants.flatMap(v=>v.ink.flatMap(p=>[p.left,p.right])))].sort((a,b)=>a-b)
  const sweeps=variants.map(variant=>{
    const ink=variant.ink.filter(piece=>piece.right>piece.left)
    return {starts:[...ink].sort((a,b)=>a.left-b.left),ends:[...ink].sort((a,b)=>a.right-b.right),
      start:0,end:0,active:new Set<NativeInk>()}
  })
  const ink:NativeInk[]=[]
  for(let i=1;i<edges.length;i++) {
    const left=edges[i-1]!,right=edges[i]!
    let top=-Infinity,bottom=Infinity,covered=true
    for(const sweep of sweeps) {
      while(sweep.start<sweep.starts.length && sweep.starts[sweep.start]!.left<=left)sweep.active.add(sweep.starts[sweep.start++]!)
      while(sweep.end<sweep.ends.length && sweep.ends[sweep.end]!.right<=left)sweep.active.delete(sweep.ends[sweep.end++]!)
      if(!sweep.active.size){covered=false;continue}
      let upper=Infinity,lower=-Infinity
      for(const piece of sweep.active){upper=Math.min(upper,piece.top);lower=Math.max(lower,piece.bottom)}
      top=Math.max(top,upper);bottom=Math.min(bottom,lower)
    }
    if(!covered)continue
    if(bottom<top)continue
    const previous=ink.at(-1)
    if(previous?.right===left && previous.top===top && previous.bottom===bottom)previous.right=right
    else ink.push({left,right,top,bottom})
  }
  const top=Math.max(...variants.map(v=>v.top)),bottom=Math.min(...variants.map(v=>v.bottom))
  return {...blocks[0]!,baseline:0,height:bottom-top,resolvedInk:true,ink,
    boundaryInk:[{left:0,right:1,top,bottom}],
    core:{top:Math.max(...variants.map(v=>v.core.top)),bottom:Math.min(...variants.map(v=>v.core.bottom))}}
}
