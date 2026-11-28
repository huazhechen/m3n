import type { ScoreVerticalSpacing } from './policy.js'
import { scorePageCollision, scorePageDistance } from './page-collision.js'
import { scorePageGeometry, type ScorePageGeometry } from './page-geometry.js'
import type { ScorePageBlock } from './geometry.js'
import type { ScoreLineCandidate } from './line-breaking.js'

/** Optimistic pagination of a fixed plan. Keep core clearance and page edges,
 * omit every painted-ink collision. Every actual page is feasible in this
 * model; taking the longest fitting prefix therefore cannot use more pages. */
export function scoreCorePageLowerBound(blocks:readonly ScorePageBlock[],options:{pageHeight:number;margin:number;gap:number;vertical?:ScoreVerticalSpacing;headerGap:number}):number {
  const {pageHeight,margin,gap,headerGap}=options
  let page=1,baseline=0,previous:{bottom:number;music:boolean;scale:number}|undefined
  for(const block of blocks) {
    const axis=block.baseline ?? 0,pieces=[...(block.ink ?? []),...(block.boundaryInk ?? [])]
    const top=Math.min(0,...pieces.map(piece=>piece.top-axis)),bottom=Math.max(0,...pieces.map(piece=>piece.bottom-axis))
    if(bottom-top>pageHeight-2*margin+1e-6)return Infinity
    const coreTop=block.core ? block.core.top-axis : top,coreBottom=block.core ? block.core.bottom-axis : bottom
    const first=margin-top
    const next=previous ? Math.max(first,baseline+previous.bottom-coreTop+(previous.music && block.core ? (options.vertical ? gap : block.coreGapBefore ?? gap*previous.scale) : headerGap))+(block.gapBefore ?? 0) : first
    if(previous && next+bottom>pageHeight-margin+1e-6){page++;baseline=first}else baseline=next
    previous={bottom:coreBottom,music:Boolean(block.core),scale:block.coreGapScale ?? 1}
  }
  return blocks.length ? page : 0
}

type Box = ScorePageGeometry
type State = { box: Box; page: number; baseline: number; previous?: State; end?: number }
const box = (block: ScorePageBlock): Box => {
  const geometry = scorePageGeometry(block)
  geometry.ink.sort((a,b)=>a.left-b.left); geometry.sorted = true
  return geometry
}

/** Optimistic feasibility for adjacent-element minimum-gap pagination. For each last row,
 * retain the smallest page index, then the lowest baseline. That state can
 * accommodate every suffix accommodated by another state for the same row.
 * Only adjacent resolved primitives constrain this bound; remote-row ink is
 * checked by the shared exact paginator before accepting a witness.
 * Tail redistribution and gap fitting never change the number of pages. */
export function scorePageFeasibility(candidates: readonly (readonly ScoreLineCandidate[])[],
  blockFor: (start: number, end: number) => ScorePageBlock, headers: readonly ScorePageBlock[],
  options: { pageHeight: number; margin: number; gap: number; vertical?: ScoreVerticalSpacing; headerGap: number; onWitness?: (ends: number[]) => void; witnessCache?: { ends?: number[] } }) {
  const { pageHeight, margin, gap, headerGap } = options
  const tracksWitness=Boolean(options.onWitness || options.witnessCache)
  const boxes = Array<Map<number,Box>|undefined>(candidates.length)
  const rowBox=(start:number,end:number)=>{
    let rows=boxes[start]
    const saved=rows?.get(end)
    if(saved)return saved
    const value=box(blockFor(start,end))
    if(!rows){rows=new Map();boxes[start]=rows}
    rows.set(end,value);return value
  }
  const advance = (item: Box, previous?: State, best?: State, ceiling=Infinity): State | undefined => {
    if (item.bottom - item.top > pageHeight - 2 * margin + 1e-6) return
    let baseline = margin - item.top, page = previous?.page ?? 0
    if (previous) {
      const localGap = options.vertical ? (previous.box.music && item.music ? gap : Math.min(gap, headerGap / .8)) : item.gap ?? gap * previous.box.scale
      const separation = previous.box.music && item.music ? localGap : headerGap
      const pair = previous.box.resolved && item.resolved
        ? scorePageCollision(previous.box, item) : {collision:-Infinity,edge:-Infinity}
      baseline = Math.max(baseline, previous.baseline + previous.box.coreBottom - item.coreTop + separation,
        previous.baseline + scorePageDistance(pair, localGap, -Infinity)) + item.before
      if (baseline + item.bottom > pageHeight - margin + 1e-6) {
        page++; baseline = margin - item.top
      }
    }
    if(page>=ceiling || best && (page>best.page || page===best.page && baseline>=best.baseline))return
    return { box: item, page, baseline }
  }
  let header: State | undefined
  for (const block of headers) {
    header = advance(box(block), header)
    if (!header) return () => false
  }
  const prefixTransitions = new WeakMap<object, WeakMap<Box, State | undefined>>()
  const noHeader = {}
  let cachedTransitions = 0
  const publishWitness = (winner: State | undefined) => {
    if (!tracksWitness) return
    const ends: number[] = []
    for(let state=winner;state?.end!==undefined;state=state.previous)ends.push(state.end)
    ends.reverse()
    if(options.witnessCache)options.witnessCache.ends=ends
    options.onWitness?.(ends)
  }
  return (restricted: readonly (readonly ScoreLineCandidate[])[], ceiling: number): boolean => {
    if (!restricted.length) return false
    // Recheck a prior width's witness against this graph and its current
    // geometry. Reuse the path only, never a page count or feasibility result.
    const cached=options.witnessCache?.ends
    if(cached?.at(-1)===restricted.length) {
      let start=0,prior=header
      for(const end of cached) {
        if(!restricted[start]?.some(row=>row.end===end))break
        const next=advance(rowBox(start,end),prior,undefined,ceiling)
        if(!next)break
        if(tracksWitness){next.previous=prior;next.end=end}
        prior=next;start=end
      }
      if(start===restricted.length){publishWitness(prior);return true}
    }
    // Lawler branches share long fixed prefixes. Their exact pagination is
    // deterministic and independent of the cost/page ceiling being queried.
    let beginning=0,initial=header
    while (beginning<restricted.length && restricted[beginning]!.length===1) {
      const row=restricted[beginning]![0]!,item=rowBox(beginning,row.end),key=initial ?? noHeader
      let peers=prefixTransitions.get(key)
      let next: State | undefined
      if (peers?.has(item)) next=peers.get(item)
      else {
        next=advance(item,initial)
        if (next && tracksWitness) {next.previous=initial;next.end=row.end}
        // Bound retained cache memory, never the number of paths searched.
        if (cachedTransitions<8192) {
          if (!peers) {peers=new WeakMap();prefixTransitions.set(key,peers)}
          peers.set(item,next);cachedTransitions++
        }
      }
      if (!next || next.page>=ceiling) return false
      initial=next;beginning=row.end
    }
    if (beginning===restricted.length) {publishWitness(initial);return true}
    // A cheap feasible witness keeps this candidate alive without building
    // every possible row bound. Failure proves nothing: the full graph below
    // still explores all legal partitions with the original dominance rule.
    let at=beginning,witness=initial
    while(at<restricted.length) {
      const end=Math.max(...restricted[at]!.map(row=>row.end))
      if(!Number.isFinite(end) || end<=at)break
      const next=advance(rowBox(at,end),witness,undefined,ceiling)
      if(!next)break
      if(tracksWitness){next.previous=witness;next.end=end}
      witness=next;at=end
    }
    if(at===restricted.length){publishWitness(witness);return true}
    // Each (start,end) row contributes at most one state, visited in ascending
    // start order. Appending preserves Map insertion order without allocating
    // a Map and a copied values array at every (often unreachable) endpoint.
    const states: Array<State[] | undefined> = []
    for (let start = beginning; start < restricted.length; start++) {
      const previous = start === beginning ? [initial] : states[start]
      if (!previous?.length) continue
      for (const row of restricted[start]!) {
        const item = rowBox(start,row.end)
        let best: State | undefined
        for (const prior of previous) {
          const next = advance(item, prior, best, ceiling)
          if (!next) continue
          if (tracksWitness) { next.previous = prior; next.end = row.end }
          best = next
        }
        if (best) (states[row.end] ??= []).push(best)
      }
      states[start] = undefined
    }
    const winners = states[restricted.length] ?? []
    if (tracksWitness && winners.length) {
      const winner = winners.sort((a,b)=>a.page-b.page || a.baseline-b.baseline)[0]!
      publishWitness(winner)
    }
    return winners.length > 0
  }
}
