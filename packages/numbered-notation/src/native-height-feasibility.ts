import { sortedNativeInkSeparation } from './native-ink-separation.js'
import type { NativeInk } from './native-ink.js'
import type { NativePageBlock } from './native-pagination.js'
import type { NativeLineCandidate } from './native-line-breaking.js'

/** Optimistic pagination of a fixed plan. Keep core clearance and page edges,
 * omit every painted-ink collision. Every actual page is feasible in this
 * model; taking the longest fitting prefix therefore cannot use more pages. */
export function nativeCorePageLowerBound(blocks:readonly NativePageBlock[],options:{pageHeight:number;margin:number;gap:number;headerGap:number}):number {
  const {pageHeight,margin,gap,headerGap}=options
  let page=1,baseline=0,previous:{bottom:number;music:boolean;scale:number}|undefined
  for(const block of blocks) {
    const axis=block.baseline ?? 0,pieces=[...(block.ink ?? []),...(block.boundaryInk ?? [])]
    const top=Math.min(0,...pieces.map(piece=>piece.top-axis)),bottom=Math.max(0,...pieces.map(piece=>piece.bottom-axis))
    if(bottom-top>pageHeight-2*margin+1e-6)return Infinity
    const coreTop=block.core ? block.core.top-axis : top,coreBottom=block.core ? block.core.bottom-axis : bottom
    const first=margin-top
    const next=previous ? Math.max(first,baseline+previous.bottom-coreTop+(previous.music && block.core ? block.coreGapBefore ?? gap*previous.scale : headerGap))+(block.gapBefore ?? 0) : first
    if(previous && next+bottom>pageHeight-margin+1e-6){page++;baseline=first}else baseline=next
    previous={bottom:coreBottom,music:Boolean(block.core),scale:block.coreGapScale ?? 1}
  }
  return blocks.length ? page : 0
}

type Box = { ink: NativeInk[]; resolved: boolean; top: number; bottom: number; coreTop: number; coreBottom: number; music: boolean; scale: number; gap?: number; before: number }
type State = { box: Box; page: number; baseline: number; previous?: State; end?: number }
const box = (block: NativePageBlock): Box => {
  const axis = block.baseline ?? 0
  const ink = [...(block.ink ?? []), ...(block.boundaryInk ?? [])]
  const top = Math.min(0, ...ink.map(item => item.top - axis))
  const bottom = Math.max(0, ...ink.map(item => item.bottom - axis))
  return { ink: (block.ink ?? []).map(item=>({...item,top:item.top-axis,bottom:item.bottom-axis})).sort((a,b)=>a.left-b.left), resolved: Boolean(block.resolvedInk), top, bottom, coreTop: block.core ? block.core.top - axis : top,
    coreBottom: block.core ? block.core.bottom - axis : bottom, music: Boolean(block.core),
    scale: block.coreGapScale ?? 1, gap: block.coreGapBefore, before: block.gapBefore ?? 0 }
}

/** Exact feasibility for whole-row, minimum-gap pagination. For each last row,
 * retain the smallest page index, then the lowest baseline. That state can
 * accommodate every suffix accommodated by another state for the same row.
 * Tail redistribution and gap fitting never change the number of pages. */
export function nativeWholeRowFeasibility(candidates: readonly (readonly NativeLineCandidate[])[],
  blockFor: (start: number, end: number) => NativePageBlock, headers: readonly NativePageBlock[],
  options: { pageHeight: number; margin: number; gap: number; headerGap: number; ratio: number; primitivePairs?: boolean; wholeRows?: boolean; onWitness?: (ends: number[]) => void }) {
  const { pageHeight, margin, gap, headerGap, ratio } = options
  const boxes = candidates.map((rows, start) => new Map(rows.map(row => [row.end, box(blockFor(start, row.end))])))
  const advance = (item: Box, previous?: State, best?: State, ceiling=Infinity): State | undefined => {
    if (item.bottom - item.top > pageHeight - 2 * margin + 1e-6) return
    let baseline = margin - item.top, page = previous?.page ?? 0
    if (previous) {
      const localGap = item.gap ?? gap * previous.box.scale
      const separation = previous.box.music && item.music ? localGap : headerGap
      const collision = options.primitivePairs
        ? previous.box.resolved && item.resolved
          ? options.wholeRows ? previous.box.bottom-item.top : sortedNativeInkSeparation(previous.box.ink,item.ink)
          : -Infinity
        : previous.box.bottom-item.top
      baseline = Math.max(baseline, previous.baseline + previous.box.coreBottom - item.coreTop + separation,
        previous.baseline + collision + ratio * localGap) + item.before
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
    if (!options.onWitness) return
    const ends: number[] = []
    for(let state=winner;state?.end!==undefined;state=state.previous)ends.push(state.end)
    options.onWitness(ends.reverse())
  }
  return (restricted: readonly (readonly NativeLineCandidate[])[], ceiling: number): boolean => {
    if (!restricted.length) return false
    // Lawler branches share long fixed prefixes. Their exact pagination is
    // deterministic and independent of the cost/page ceiling being queried.
    let beginning=0,initial=header
    while (beginning<restricted.length && restricted[beginning]!.length===1) {
      const row=restricted[beginning]![0]!,item=boxes[beginning]!.get(row.end)!,key=initial ?? noHeader
      let peers=prefixTransitions.get(key)
      let next: State | undefined
      if (peers?.has(item)) next=peers.get(item)
      else {
        next=advance(item,initial)
        if (next && options.onWitness) {next.previous=initial;next.end=row.end}
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
    // Each (start,end) row contributes at most one state, visited in ascending
    // start order. Appending preserves Map insertion order without allocating
    // a Map and a copied values array at every (often unreachable) endpoint.
    const states: Array<State[] | undefined> = []
    for (let start = beginning; start < restricted.length; start++) {
      const previous = start === beginning ? [initial] : states[start]
      if (!previous?.length) continue
      for (const row of restricted[start]!) {
        const item = boxes[start]!.get(row.end)!
        let best: State | undefined
        for (const prior of previous) {
          const next = advance(item, prior, best, ceiling)
          if (!next) continue
          if (options.onWitness) { next.previous = prior; next.end = row.end }
          best = next
        }
        if (best) (states[row.end] ??= []).push(best)
      }
      states[start] = undefined
    }
    const winners = states[restricted.length] ?? []
    if (options.onWitness && winners.length) {
      const winner = winners.sort((a,b)=>a.page-b.page || a.baseline-b.baseline)[0]!
      publishWitness(winner)
    }
    return winners.length > 0
  }
}
